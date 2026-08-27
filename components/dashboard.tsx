'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Sun, Inbox, BookOpen, MoreHorizontal, X, Circle,
  Target, Wallet, Users, Settings, Dumbbell,
  BarChart3, Calendar, Sparkles, Leaf, ChevronRight
} from 'lucide-react';

// Primary tabs - loaded eagerly
import { TodayView } from '@/components/today-view';
import { InboxView } from '@/components/inbox-view';
import { AiBrain } from '@/components/ai-brain';

// Secondary tabs - loaded lazily
const ReflectView = dynamic(() => import('@/components/reflect-view').then(m => ({ default: m.ReflectView })), { ssr: false });
const GoalsView = dynamic(() => import('@/components/goals-view').then(m => ({ default: m.GoalsView })), { ssr: false });
const FinanceView = dynamic(() => import('@/components/finance-view').then(m => ({ default: m.FinanceView })), { ssr: false });
const PeopleView = dynamic(() => import('@/components/people-view').then(m => ({ default: m.PeopleView })), { ssr: false });
const SettingsView = dynamic(() => import('@/components/settings-view').then(m => ({ default: m.SettingsView })), { ssr: false });
const GymView = dynamic(() => import('@/components/gym-view').then(m => ({ default: m.GymView })), { ssr: false });
const HabitsView = dynamic(() => import('@/components/habits-view').then(m => ({ default: m.HabitsView })), { ssr: false });
const CalendarView = dynamic(() => import('@/components/calendar-view').then(m => ({ default: m.CalendarView })), { ssr: false });
const PillarDashboard = dynamic(() => import('@/components/pillar-dashboard').then(m => ({ default: m.PillarDashboard })), { ssr: false });
const JournalView = dynamic(() => import('@/components/journal-view').then(m => ({ default: m.JournalView })), { ssr: false });
const ButlerChat = dynamic(() => import('@/components/butler/butler-chat').then(m => ({ default: m.ButlerChat })), { ssr: false });
const OpenLoopsTriage = dynamic(() => import('@/components/butler/open-loops-triage').then(m => ({ default: m.OpenLoopsTriage })), { ssr: false });

type PrimaryTab = 'today' | 'inbox' | 'reflect';
type SecondaryTab = 'butler' | 'loops' | 'goals' | 'finance' | 'people' | 'habits' | 'gym' | 'calendar' | 'scores' | 'journal' | 'settings';
type TabKey = PrimaryTab | SecondaryTab;

const PRIMARY_TABS: { key: PrimaryTab; label: string; icon: any }[] = [
  { key: 'today', label: 'Today', icon: Sun },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'reflect', label: 'Reflect', icon: BookOpen },
];

const SECONDARY_TABS: { key: SecondaryTab; label: string; icon: any; description: string }[] = [
  { key: 'butler', label: 'Butler', icon: Sparkles, description: 'Agentic chief-of-staff' },
  { key: 'loops', label: 'Open Loops', icon: Circle, description: 'Triage what\'s on your mind' },
  { key: 'goals', label: 'Goals', icon: Target, description: 'Strategy & direction' },
  { key: 'finance', label: 'Finance', icon: Wallet, description: 'Money & investments' },
  { key: 'people', label: 'People', icon: Users, description: 'Relationships & CRM' },
  { key: 'habits', label: 'Habits', icon: Leaf, description: 'Routine management' },
  { key: 'gym', label: 'Gym', icon: Dumbbell, description: 'Workout tracking' },
  { key: 'calendar', label: 'Calendar', icon: Calendar, description: 'Full calendar view' },
  { key: 'scores', label: 'Life Scores', icon: BarChart3, description: 'Manual score entries' },
  { key: 'journal', label: 'Journal', icon: BookOpen, description: 'Full journal history' },
  { key: 'settings', label: 'Settings', icon: Settings, description: 'Preferences & config' },
];

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [scores, setScores] = useState<any[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const lastActiveRef = useRef<NodeJS.Timeout | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch('/api/scores');
      if (res.ok) {
        const data = await res.json();
        setScores(data ?? []);
      }
    } catch (e: any) {
      console.error('Error fetching scores:', e);
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // Session heartbeat: update lastActiveAt periodically and on close
  useEffect(() => {
    const heartbeat = () => {
      fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => {});
    };
    // Heartbeat every 5 minutes
    heartbeat();
    const interval = setInterval(heartbeat, 5 * 60 * 1000);
    
    // On page hide/close
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Use sendBeacon for reliability on close
        navigator.sendBeacon?.('/api/session/heartbeat');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Persist last tab to sessionContext
  useEffect(() => {
    if (lastActiveRef.current) clearTimeout(lastActiveRef.current);
    lastActiveRef.current = setTimeout(() => {
      fetch('/api/session/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastTab: activeTab })
      }).catch(() => {});
    }, 500);
  }, [activeTab]);

  // Listen for cross-component navigation events
  useEffect(() => {
    const handleNavigateEmail = (e: any) => {
      setActiveTab('inbox');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('inbox:openEmail', { detail: e.detail }));
      }, 200);
    };
    const handleNavigateTab = (e: CustomEvent<{ tab: TabKey }>) => {
      setActiveTab(e.detail.tab);
    };
    window.addEventListener('navigate:email', handleNavigateEmail);
    window.addEventListener('navigate:tab', handleNavigateTab as EventListener);
    return () => {
      window.removeEventListener('navigate:email', handleNavigateEmail);
      window.removeEventListener('navigate:tab', handleNavigateTab as EventListener);
    };
  }, []);

  const handleNav = (key: TabKey) => {
    setActiveTab(key);
    setMoreOpen(false);
  };

  const isPrimary = PRIMARY_TABS.some(t => t.key === activeTab);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Main content area */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          {activeTab === 'today' && <TodayView scores={scores} onNavigate={(tab: any) => handleNav(tab)} />}
          {activeTab === 'inbox' && <InboxView scores={scores} onNavigate={(tab: any) => handleNav(tab)} />}
          {activeTab === 'reflect' && <ReflectView scores={scores} onScoreAdded={fetchScores} />}
          {activeTab === 'goals' && <GoalsView />}
          {activeTab === 'finance' && <FinanceView />}
          {activeTab === 'people' && <PeopleView />}
          {activeTab === 'habits' && <HabitsView />}
          {activeTab === 'gym' && <GymView />}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'scores' && <PillarDashboard scores={scores} onScoreAdded={fetchScores} />}
          {activeTab === 'journal' && <JournalView scores={scores} />}
          {activeTab === 'butler' && <ButlerChat />}
          {activeTab === 'loops' && <OpenLoopsTriage />}
          {activeTab === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
        <div className="max-w-[480px] mx-auto flex items-center justify-around h-16 px-2">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleNav(tab.key)}
                className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-xl transition-all min-w-[64px]
                  ${isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                  }
                `}
              >
                <div className={`p-1 rounded-lg transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-xl transition-all min-w-[64px]
              ${!isPrimary && !moreOpen
                ? 'text-primary'
                : 'text-muted-foreground'
              }
            `}
          >
            <div className={`p-1 rounded-lg transition-all ${!isPrimary && !moreOpen ? 'bg-primary/10' : ''}`}>
              <MoreHorizontal className="w-5 h-5" strokeWidth={!isPrimary ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] leading-tight ${!isPrimary ? 'font-semibold' : 'font-medium'}`}>
              {!isPrimary ? SECONDARY_TABS.find(t => t.key === activeTab)?.label || 'More' : 'More'}
            </span>
          </button>
        </div>
      </nav>

      {/* More Menu Drawer */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-2xl border-t border-border shadow-lg animate-in slide-in-from-bottom duration-200 max-h-[70dvh] overflow-y-auto safe-area-bottom">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Leaf className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-display font-bold text-base">Life OS</span>
              </div>
              <button onClick={() => setMoreOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-3 pb-6 pt-1">
              {SECONDARY_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleNav(tab.key)}
                    className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-all
                      ${isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-secondary'
                      }
                    `}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/15' : 'bg-muted'}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</div>
                      <div className="text-xs text-muted-foreground">{tab.description}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {/* AI Brain */}
      <AiBrain />
    </div>
  );
}
