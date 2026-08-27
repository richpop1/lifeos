'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sun, Moon, Zap, BookOpen, Compass, Target, CheckCircle2, Circle, Loader2, FolderKanban, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { JournalChat } from '@/components/journal-chat';
import { JournalTimeline } from '@/components/journal-timeline';

const MOODS = [
  { key: 'energized', emoji: '✨', label: 'Energized' },
  { key: 'calm', emoji: '🌿', label: 'Calm' },
  { key: 'focused', emoji: '🎯', label: 'Focused' },
  { key: 'happy', emoji: '☀️', label: 'Happy' },
  { key: 'neutral', emoji: '🌤️', label: 'Neutral' },
  { key: 'anxious', emoji: '🌪️', label: 'Anxious' },
  { key: 'tired', emoji: '🌙', label: 'Tired' },
  { key: 'stressed', emoji: '💨', label: 'Stressed' },
];

const STAT_LABELS: Record<string, string> = {
  activeIncome: 'Active Income', passiveIncome: 'Passive Income',
  riskManagement: 'Risk Management', personalBudget: 'Budget Discipline',
  physical: 'Physical Health', emotional: 'Emotional Wellbeing',
  mental: 'Focus & Mental Clarity', spiritual: 'Spiritual Practice',
  partner: 'Partner Relationship', family: 'Family Connection',
  friends: 'Friendships', community: 'Community Involvement',
};

interface Props {
  scores: any[];
}

export function JournalView({ scores }: Props) {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionType, setSessionType] = useState<'morning' | 'evening'>('morning');
  const [entries, setEntries] = useState<any[]>([]);
  const [northStar, setNorthStar] = useState<string | null>(null);
  const [alterEgoName, setAlterEgoName] = useState<string | null>(null);
  const [dailyFocus, setDailyFocus] = useState<any>(null);
  const [loadingFocus, setLoadingFocus] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [sessionGoalId, setSessionGoalId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null); // null = today, ISO string = backlog date
  const [showBacklog, setShowBacklog] = useState(false);
  // Continuation mode state
  const [continueEntry, setContinueEntry] = useState<any>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/journal?limit=30');
      if (res.ok) setEntries(await res.json());
    } catch (e: any) { console.error(e); }
  }, []);

  const fetchDailyFocus = useCallback(async () => {
    try { const r = await fetch('/api/daily-focus'); if (r.ok) setDailyFocus(await r.json()); } catch {}
  }, []);

  useEffect(() => { fetchEntries(); fetchDailyFocus(); }, [fetchEntries, fetchDailyFocus]);

  // Fetch goals for filter chips
  useEffect(() => {
    fetch('/api/goals').then(r => r.ok ? r.json() : []).then(g => setGoals((g || []).filter((x: any) => x.status === 'active'))).catch(() => {});
  }, []);

  // Refetch when filter changes
  useEffect(() => {
    const url = filterGoalId ? `/api/journal?limit=30&goalId=${filterGoalId}` : '/api/journal?limit=30';
    fetch(url).then(r => r.ok ? r.json() : []).then(setEntries).catch(() => {});
  }, [filterGoalId]);

  // Fetch profile data
  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (p?.alterEgoName) setAlterEgoName(p.alterEgoName);
      if (p?.northStar) setNorthStar(p.northStar);
    }).catch(() => {});
  }, []);

  // Find weakest areas
  const weakAreas = useMemo(() => {
    const latest = scores?.[scores?.length - 1];
    if (!latest) return [];
    const all = Object.entries(STAT_LABELS).map(([key, label]) => ({
      key, label, value: latest?.[key] ?? 5,
    }));
    return all.sort((a, b) => a.value - b.value).slice(0, 3);
  }, [scores]);

  // Determine time-based suggestion
  const [suggestedSession, setSuggestedSession] = useState<'morning' | 'evening'>('morning');
  useEffect(() => {
    const hour = new Date().getHours();
    setSuggestedSession(hour < 14 ? 'morning' : 'evening');
  }, []);

  // Get latest entry stats
  const latestEntry = entries?.[0];
  const lastFocusRazor = latestEntry?.focusRazor || null;
  const lastDayTitle = latestEntry?.dayTitle || null;

  const handleSessionComplete = () => {
    setSessionActive(false);
    setContinueEntry(null);
    fetchEntries();
  };

  if (sessionActive) {
    return (
      <JournalChat
        sessionType={sessionType}
        moods={MOODS}
        onComplete={handleSessionComplete}
        onCancel={() => { setSessionActive(false); setSessionDate(null); setContinueEntry(null); }}
        goalId={sessionGoalId}
        journalDate={sessionDate}
        continueEntryId={continueEntry?.id || null}
        existingMessages={continueEntry?.chatMessages || undefined}
        existingMoodStart={continueEntry?.moodStart || null}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-display font-bold tracking-tight flex items-center gap-2">
          <Compass className="w-5 h-5 text-primary" /> Freedom Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {northStar || 'Your razor-focused life operating system.'}
        </p>
      </div>

      {/* Last Razor / Signal */}
      {(lastFocusRazor || lastDayTitle) && (
        <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Last session</span>
          </div>
          {lastDayTitle && <p className="text-sm font-display font-semibold">"{lastDayTitle}"</p>}
          {lastFocusRazor && <p className="text-xs text-muted-foreground mt-1">🔪 {lastFocusRazor}</p>}
        </div>
      )}

      {/* Today's Focus Quick View */}
      {dailyFocus?.focusItems && (
        <div className="bg-card rounded-xl p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-mono text-amber-600 uppercase tracking-wider">Today's Focus</span>
          </div>
          <div className="space-y-1.5">
            {(dailyFocus.focusItems as any[]).map((item: any, idx: number) => {
              const completed = (dailyFocus.completed || []) as any[];
              const isDone = completed.some((c: any) => c.index === idx);
              return (
                <div key={idx} className="flex items-center gap-2">
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className={`text-[12px] ${isDone ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>{item.title}</span>
                </div>
              );
            })}
          </div>
          {dailyFocus.aiSummary && <p className="text-[9px] text-muted-foreground italic mt-2">{dailyFocus.aiSummary}</p>}
        </div>
      )}

      {/* Session Starters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={async () => {
            if (!dailyFocus?.focusItems) {
              setLoadingFocus(true);
              try { const r = await fetch('/api/daily-focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); if (r.ok) setDailyFocus(await r.json()); } catch {}
              setLoadingFocus(false);
            }
            setSessionType('morning'); setSessionActive(true);
          }}
          disabled={loadingFocus}
          className={`bg-card rounded-xl p-5 text-left transition-all hover:shadow-md ${
            suggestedSession === 'morning' ? 'ring-2 ring-amber-400/50' : ''
          }`}
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Sun className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Morning Razor</h3>
              <p className="text-xs text-muted-foreground">Focus → Clean Win → Razor → Execute</p>
            </div>
          </div>
          {suggestedSession === 'morning' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">SUGGESTED NOW</p>
          )}
          {weakAreas.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Weak areas: {weakAreas.map(w => w.label).join(', ')}
            </p>
          )}
        </button>

        <button
          onClick={() => { setSessionType('evening'); setSessionActive(true); }}
          className={`bg-card rounded-xl p-5 text-left transition-all hover:shadow-md ${
            suggestedSession === 'evening' ? 'ring-2 ring-indigo-400/50' : ''
          }`}
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <Moon className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Evening Reflection</h3>
              <p className="text-xs text-muted-foreground">Day Title → Reality → Signal → Mirror</p>
            </div>
          </div>
          {suggestedSession === 'evening' && (
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">SUGGESTED NOW</p>
          )}
        </button>
      </div>

      {/* Catch Up / Backlog */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <button
          onClick={() => setShowBacklog(!showBacklog)}
          className="flex items-center gap-2 w-full text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
            <History className="w-4 h-4 text-violet-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-sm">Catch Up on Missed Days</h3>
            <p className="text-[10px] text-muted-foreground">Journal for a past date you missed</p>
          </div>
        </button>
        {showBacklog && (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="date"
              max={typeof window !== 'undefined' ? new Date(Date.now() - 86400000).toISOString().split('T')[0] : undefined}
              className="flex-1 text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              onChange={(e) => {
                if (e.target.value) {
                  setSessionDate(e.target.value);
                }
              }}
            />
            <Button
              size="sm"
              disabled={!sessionDate}
              onClick={() => {
                setSessionType('evening');
                setSessionActive(true);
                setShowBacklog(false);
              }}
            >
              Start
            </Button>
          </div>
        )}
      </div>

      {/* Goal Filter + Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" /> Timeline
          </h2>
        </div>
        {goals.length > 0 && (
          <div className="flex gap-1.5 mb-3 flex-wrap">
            <button onClick={() => setFilterGoalId(null)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${!filterGoalId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}>All</button>
            {goals.map((g: any) => (
              <button key={g.id} onClick={() => setFilterGoalId(g.id)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${filterGoalId === g.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}>
                {g.isProject && <FolderKanban className="w-3 h-3" />}{g.title}
              </button>
            ))}
          </div>
        )}
        <JournalTimeline entries={entries}
          onEntryDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
          onEntryUpdated={(updated) => setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))}
          onContinue={(entry) => {
            setContinueEntry(entry);
            setSessionType(entry.sessionType || 'evening');
            setSessionGoalId(entry.goalId || null);
            setSessionActive(true);
          }}
        />
      </div>
    </div>
  );
}
