'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Sun, Moon, Coffee, CheckCircle2, Circle, Clock,
  ChevronRight, Inbox, Zap, MapPin, Target,
  Sparkles, ArrowRight, Bell, Archive, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { QuickCapture } from '@/components/butler/quick-capture';
import { DailyBriefingCard } from '@/components/butler/daily-briefing-card';

interface Props {
  scores: any[];
  onNavigate: (tab: any) => void;
}

interface TodayData {
  lastActiveAt: string;
  hoursSinceActive: number;
  sessionContext: any;
  mission: string | null;
  northStar: string | null;
  alterEgoName: string | null;
  alterEgoMantra: string | null;
  focusItems: any[];
  dailyFocusId: string | null;
  tasks: any[];
  habits: { id: string; title: string; icon: string | null; color: string | null; done: boolean; targetTime: string | null }[];
  upcomingEvents: any[];
  newEmailCount: number;
  activityFeed: any[];
  pendingBatches: any[];
  totalActiveTasks: number;
  habitsCompleted: number;
  habitsTotal: number;
}

function getGreeting(): { text: string; icon: any; period: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: Coffee, period: 'morning' };
  if (hour < 17) return { text: 'Good afternoon', icon: Sun, period: 'afternoon' };
  return { text: 'Good evening', icon: Moon, period: 'evening' };
}

function formatEventTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Singapore',
  });
}

function pillarColor(pillar?: string) {
  switch (pillar) {
    case 'wealth': return 'text-emerald-600 bg-emerald-50';
    case 'health': return 'text-orange-600 bg-orange-50';
    case 'relationship': return 'text-pink-600 bg-pink-50';
    default: return 'text-muted-foreground bg-muted';
  }
}

export function TodayView({ scores, onNavigate }: Props) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingHabit, setTogglingHabit] = useState<string | null>(null);

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/today');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('[TODAY] Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToday();
    // Refresh when AI takes an action
    const handleAiAction = () => { fetchToday(); };
    window.addEventListener('ai:action', handleAiAction);
    return () => window.removeEventListener('ai:action', handleAiAction);
  }, [fetchToday]);

  const toggleHabit = async (habitId: string, currentDone: boolean) => {
    if (togglingHabit) return;
    setTogglingHabit(habitId);
    try {
      // Optimistic update
      setData(prev => prev ? {
        ...prev,
        habits: prev.habits.map(h => h.id === habitId ? { ...h, done: !currentDone } : h),
        habitsCompleted: prev.habitsCompleted + (currentDone ? -1 : 1),
      } : prev);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today.toISOString() }),
      });
    } catch {
      // Revert on error
      fetchToday();
    } finally {
      setTogglingHabit(null);
    }
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-2xl" />
        <div className="h-24 bg-muted rounded-2xl" />
        <div className="h-40 bg-muted rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p>Couldn't load your day. Pull to refresh.</p>
        <Button variant="outline" className="mt-3" onClick={fetchToday}>Retry</Button>
      </div>
    );
  }

  const { focusItems, habits, upcomingEvents, newEmailCount, pendingBatches, totalActiveTasks, habitsCompleted, habitsTotal } = data;

  return (
    <div className="space-y-5 pb-4">
      {/* Greeting + Delta */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <GreetingIcon className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">{greeting.text}</h1>
        </div>
        {data.hoursSinceActive > 0 && (
          <p className="text-sm text-muted-foreground">
            {data.hoursSinceActive >= 24
              ? `Welcome back — it's been a while`
              : `${data.hoursSinceActive}h since you last checked in`
            }
          </p>
        )}
        {data.alterEgoMantra && (
          <p className="text-xs text-primary/70 italic mt-1">"{data.alterEgoMantra}"</p>
        )}
      </div>

      {/* Butler Briefing — Jarvis-style daily summary */}
      <DailyBriefingCard onNavigate={onNavigate} alterEgoName={data.alterEgoName} />

      {/* Quick Capture — dump-and-go */}
      <QuickCapture />

      {/* Quick Stats Bar */}
      <div className="flex gap-2">
        <button
          onClick={() => onNavigate('inbox')}
          className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
        >
          <Inbox className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{newEmailCount}</span>
          <span className="text-xs text-muted-foreground">new</span>
        </button>
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border">
          <Target className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium">{totalActiveTasks}</span>
          <span className="text-xs text-muted-foreground">tasks</span>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium">{habitsCompleted}/{habitsTotal}</span>
          <span className="text-xs text-muted-foreground">habits</span>
        </div>
      </div>

      {/* AI Pending Batches (Failsafe) */}
      {pendingBatches.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Archive className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AI wants to act</span>
          </div>
          {pendingBatches.map((batch: any) => {
            const items = batch.items as any[];
            return (
              <div key={batch.id} className="text-sm">
                <p className="text-muted-foreground">
                  {batch.type === 'archive' ? 'Archive' : batch.type} {items.length} emails
                </p>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {items.slice(0, 5).map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground truncate flex-1">{item.from}</span>
                      <span className="truncate flex-1 font-medium">{item.subject}</span>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <p className="text-xs text-muted-foreground">+{items.length - 5} more</p>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="flex-1 h-8" onClick={() => {
                    // TODO Phase 2: Approve batch
                    toast.info('Batch approval coming in Phase 2');
                  }}>
                    Approve all
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => {
                    onNavigate('inbox');
                  }}>
                    Review
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Focus Items */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <h2 className="text-sm font-semibold">Today's Focus</h2>
          </div>
          <span className="text-xs text-muted-foreground">{focusItems.length} items</span>
        </div>
        {focusItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No focus items yet. Your top tasks will appear here.</p>
        ) : (
          <div className="space-y-2">
            {focusItems.map((item: any, i: number) => (
              <div
                key={item.taskId || i}
                className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border/50 hover:border-primary/20 transition-colors"
              >
                <div className="mt-0.5">
                  {item.isNeedleMover ? (
                    <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-yellow-600" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  {item.pillar && (
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-1 ${pillarColor(item.pillar)}`}>
                      {item.pillar}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Habits */}
      {habits.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <h2 className="text-sm font-semibold">Habits</h2>
            </div>
            <span className="text-xs text-muted-foreground">{habitsCompleted}/{habitsTotal}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {habits.map((habit) => (
              <button
                key={habit.id}
                onClick={() => toggleHabit(habit.id, habit.done)}
                disabled={togglingHabit === habit.id}
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left
                  ${habit.done
                    ? 'bg-primary/5 border-primary/20 text-primary'
                    : 'bg-background border-border/50 text-foreground hover:border-primary/20'
                  }
                  ${togglingHabit === habit.id ? 'opacity-50' : ''}
                `}
              >
                {habit.done
                  ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                }
                <span className={`text-sm truncate ${habit.done ? 'line-through opacity-60' : 'font-medium'}`}>
                  {habit.icon ? `${habit.icon} ` : ''}{habit.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold">Coming Up</h2>
            </div>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs text-primary font-medium flex items-center gap-1"
            >
              Full calendar <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event: any) => (
              <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-1 h-8 rounded-full" style={{ backgroundColor: event.color || 'hsl(var(--primary))' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatEventTime(event.startTime)}</span>
                    {event.location && (
                      <span className="flex items-center gap-0.5 truncate">
                        <MapPin className="w-3 h-3" />{event.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {data.activityFeed.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">What Changed</h2>
          </div>
          <div className="space-y-2">
            {data.activityFeed.map((item: any) => (
              <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Preview */}
      {data.tasks.length > 3 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-500" />
              <h2 className="text-sm font-semibold">Task Queue</h2>
            </div>
            <button
              onClick={() => onNavigate('inbox')}
              className="text-xs text-primary font-medium flex items-center gap-1"
            >
              See all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {data.tasks.slice(3, 8).map((task: any) => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg text-sm">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  task.priority === 'high' ? 'bg-red-500' :
                  task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                }`} />
                <span className="truncate flex-1">{task.title}</span>
                {task.goal && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pillarColor(task.goal.pillar)}`}>
                    {task.goal.title}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
