'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check, Zap, Target, ChevronDown,
  DollarSign, Users,
  Flame, BookOpen, Sparkles, Loader2,
  TrendingUp, Clock, Mail, Wallet, AlertTriangle,
  ArrowRight, RefreshCw, Send, ChevronRight,
  Compass, Star, CheckCircle2, X, ThumbsDown, Crosshair,
  Calendar, MapPin, Plus, Sunrise
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { buildGoogleCalendarUrl } from '@/lib/google-calendar-url';

const PILLAR_COLORS: Record<string, string> = { wealth: '#4ADE80', health: '#FB923C', relationship: '#F472B6' };

const ATTENTION_ICONS: Record<string, any> = {
  overdue_task: Clock,
  budget_alert: Wallet,
  email_reply: Mail,
  overdue_contact: Users,
};

interface Props {
  scores: any[];
  onNavigate: (tab: any) => void;
}

export function HomeView({ scores, onNavigate }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [todayStr, setTodayStr] = useState('1970-01-01');
  const [showMomentum, setShowMomentum] = useState(false);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [togglingHabit, setTogglingHabit] = useState<string | null>(null);
  const [dismissingTask, setDismissingTask] = useState<string | null>(null);
  const [generatingBriefing, setGeneratingBriefing] = useState(false);
  const [showFullBriefing, setShowFullBriefing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    setTodayStr(new Date().toISOString().split('T')[0]);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/butler');
      if (r.ok) setData(await r.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener('jarvis:dataChanged', handler);
    return () => window.removeEventListener('jarvis:dataChanged', handler);
  }, [fetchAll]);

  const syncCalendars = async () => {
    try {
      setSyncing(true);
      const subs = data?.calendarSubs || [];
      if (subs.length === 0) {
        toast.error('No calendars to sync. Add one in Settings → Calendar.');
        setSyncing(false);
        return;
      }
      let synced = 0;
      const errors: string[] = [];
      for (const sub of subs) {
        try {
          const r = await fetch('/api/calendar/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subId: sub.id }),
          });
          const d = await r.json().catch(() => ({}));
          if (d.needsAttention) {
            errors.push(d.error || 'Calendar URL issue');
          } else if (r.ok) {
            synced += d.synced || 0;
          } else {
            errors.push(d.error || 'Sync failed');
          }
        } catch {
          errors.push(`Failed to sync ${sub.name || 'calendar'}`);
        }
      }
      if (errors.length > 0) {
        toast.error(errors[0], { duration: 8000 });
      } else {
        toast.success(`Synced ${synced} events`);
      }
      fetchAll();
    } catch { toast.error('Sync failed'); } finally { setSyncing(false); }
  };

  const syncAndBrief = async () => {
    try {
      setSyncing(true);
      setGeneratingBriefing(true);
      const syncErrors: string[] = [];

      // 1. Sync calendars
      const subs = data?.calendarSubs || [];
      for (const sub of subs) {
        try {
          const r = await fetch('/api/calendar/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subId: sub.id }),
          });
          const d = await r.json().catch(() => ({}));
          if (d.needsAttention) syncErrors.push(d.error || 'Calendar URL issue');
        } catch { /* continue */ }
      }

      // 2. Sync & organize emails (autopilot)
      try {
        await fetch('/api/email/autopilot', { method: 'POST' });
      } catch { /* non-blocking */ }

      // 3. Generate briefing regardless of sync errors
      await fetch('/api/daily-briefing', { method: 'POST' }).catch(() => {});

      if (syncErrors.length > 0) {
        toast.error(syncErrors[0], { duration: 8000 });
        toast.info('Briefing updated (some calendars had issues)');
      } else {
        toast.success('Mail, calendar & briefing synced ✨');
      }
      // Clear email cache so inbox shows fresh data
      try { sessionStorage.removeItem('inbox_emails'); } catch {}
      fetchAll();
    } catch { toast.error('Failed'); } finally { setSyncing(false); setGeneratingBriefing(false); }
  };

  const generateBriefing = async () => {
    try {
      setGeneratingBriefing(true);
      const r = await fetch('/api/daily-briefing', { method: 'POST' });
      if (r.ok) {
        toast.success('Briefing updated');
        fetchAll();
      }
    } catch { toast.error('Failed to generate'); } finally { setGeneratingBriefing(false); }
  };

  const completeTask = async (taskId: string) => {
    try {
      setCompletingTask(taskId);
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      toast.success('Done! \u2705');
      fetchAll();
    } catch { toast.error('Failed'); } finally { setCompletingTask(null); }
  };

  const toggleHabit = async (habitId: string) => {
    try {
      setTogglingHabit(habitId);
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: todayStr }),
      });
      fetchAll();
    } catch { toast.error('Failed'); } finally { setTogglingHabit(null); }
  };

  const dismissTask = async (taskId: string) => {
    try {
      setDismissingTask(taskId);
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triageStatus: 'dismissed', resolution: 'irrelevant', resolvedReason: 'Dismissed from mission' }),
      });
      toast.success('Task dismissed');
      fetchAll();
    } catch { toast.error('Failed'); } finally { setDismissingTask(null); }
  };

  const handleAttentionAction = (item: any) => {
    switch (item.type) {
      case 'overdue_task': onNavigate('goals'); break;
      case 'email_reply': onNavigate('inbox'); break;
      case 'budget_alert': onNavigate('finance'); break;
      case 'overdue_contact': onNavigate('people'); break;
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatEventTime = (isoStr: string) => {
    return new Date(isoStr).toLocaleTimeString('en-SG', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore',
    });
  };

  const identity = data?.identity;
  const mission = data?.mission;
  const habits = data?.habits || [];
  const attention = data?.attention || [];
  const momentum = data?.momentum;
  const weekDays = data?.weekDays || [];
  const todayEvents = data?.todayEvents || [];
  const briefing = data?.briefing;

  const habitsDoneToday = habits.filter((h: any) => h.doneToday).length;
  const habitsTotal = habits.length;
  const habitProgress = habitsTotal > 0 ? (habitsDoneToday / habitsTotal) * 100 : 0;
  const allHabitsDone = habitsDoneToday === habitsTotal && habitsTotal > 0;

  const sortedHabits = [...habits].sort((a: any, b: any) => {
    if (a.doneToday === b.doneToday) return 0;
    return a.doneToday ? 1 : -1;
  });

  // Merge today's events and mission tasks into a timeline
  const todayTimeline = useMemo(() => {
    const items: { type: 'event' | 'task'; time: string | null; data: any; sortKey: number }[] = [];

    for (const ev of todayEvents) {
      const t = ev.allDay ? null : formatEventTime(ev.startTime);
      items.push({ type: 'event', time: t, data: ev, sortKey: ev.allDay ? -1 : new Date(ev.startTime).getTime() });
    }

    // Add needle mover and top tasks as timeline items
    if (mission?.needleMover) {
      items.push({ type: 'task', time: null, data: { ...mission.needleMover, isNeedleMover: true }, sortKey: Infinity });
    }
    if (mission?.topTasks?.length > 0) {
      for (const t of mission.topTasks) {
        items.push({ type: 'task', time: null, data: t, sortKey: Infinity });
      }
    }

    // Sort: timed events first (by time), then all-day events, then tasks
    items.sort((a, b) => {
      if (a.sortKey === Infinity && b.sortKey === Infinity) return 0;
      if (a.sortKey === Infinity) return 1;
      if (b.sortKey === Infinity) return -1;
      return a.sortKey - b.sortKey;
    });

    return items;
  }, [todayEvents, mission]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ═══ 1. IDENTITY ANCHOR ═══ */}
      <section className="game-card p-4 sm:p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <p className="text-[10px] font-mono text-primary/70 tracking-widest uppercase">
            {mounted ? new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' }) : '\u00A0'}
          </p>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight mt-0.5">
            {mounted ? getGreeting() : 'Welcome'}
            {identity?.alterEgoName ? <span className="text-primary">, {identity.alterEgoName}</span> : null}
          </h1>
          {identity?.northStar && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed flex items-start gap-1.5">
              <Crosshair className="w-3 h-3 mt-0.5 text-primary/60 flex-shrink-0" />
              <span className="line-clamp-2">{identity.northStar}</span>
            </p>
          )}
          {identity?.mantra && (
            <p className="text-[11px] italic text-primary/80 mt-1 pl-[18px]">
              "{identity.mantra}"
            </p>
          )}

          {/* Sync & Brief CTA */}
          {!briefing?.text ? (
            <button
              onClick={syncAndBrief}
              disabled={syncing || generatingBriefing}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-all disabled:opacity-50"
            >
              {syncing || generatingBriefing ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <RefreshCw className="w-4 h-4 text-primary" />
              )}
              <span className="text-xs font-semibold text-primary">
                {syncing ? 'Syncing mail & calendar...' : generatingBriefing ? 'Generating briefing...' : 'Sync & Start My Day'}
              </span>
            </button>
          ) : (
            <button
              onClick={syncAndBrief}
              disabled={syncing || generatingBriefing}
              className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            >
              {syncing || generatingBriefing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {syncing ? 'Syncing all...' : generatingBriefing ? 'Updating...' : 'Re-sync & refresh'}
            </button>
          )}
        </div>
      </section>

      {/* ═══ 2. WEEK STRIP ═══ */}
      {weekDays.length > 0 && (
        <section className="game-card p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">This Week</span>
            <button onClick={() => onNavigate('calendar')} className="ml-auto text-[10px] text-primary hover:underline">
              Full Calendar
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d: any) => {
              const total = d.eventCount + d.taskCount;
              return (
                <button
                  key={d.date}
                  onClick={() => onNavigate('calendar')}
                  className={`flex flex-col items-center py-1.5 px-0.5 rounded-lg transition-all ${
                    d.isToday
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : 'hover:bg-secondary/40'
                  }`}
                >
                  <span className={`text-[9px] font-mono uppercase ${
                    d.isToday ? 'text-primary font-bold' : 'text-muted-foreground'
                  }`}>{d.dayName}</span>
                  <span className={`text-sm font-bold mt-0.5 ${
                    d.isToday ? 'text-primary' : 'text-foreground'
                  }`}>{new Date(d.date + 'T00:00:00').getUTCDate()}</span>
                  {total > 0 ? (
                    <div className="flex gap-0.5 mt-0.5">
                      {d.eventCount > 0 && <span className="w-1 h-1 rounded-full bg-indigo-400" />}
                      {d.taskCount > 0 && <span className="w-1 h-1 rounded-full bg-amber-400" />}
                    </div>
                  ) : (
                    <div className="h-[6px] mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ 3. TODAY'S SCHEDULE ═══ */}
      <section className="game-card p-4 sm:p-5 border-l-[3px] border-l-primary">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-sm">Today</h2>
            {todayTimeline.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}
                {mission?.topTasks?.length > 0 ? ` · ${(mission.topTasks.length + (mission.needleMover ? 1 : 0))} task${mission.topTasks.length + (mission.needleMover ? 1 : 0) !== 1 ? 's' : ''}` : ''}
              </span>
            )}
          </div>
          <button onClick={() => onNavigate('calendar')} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {todayTimeline.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No events or tasks today</p>
            <button onClick={() => onNavigate('calendar')} className="text-xs text-primary mt-1 hover:underline">
              Add an event
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {todayTimeline.map((item, i) => {
              if (item.type === 'event') {
                const ev = item.data;
                return (
                  <div key={ev.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-secondary/30 group cursor-pointer" onClick={() => setSelectedEvent(ev)}>
                    <div className="w-12 flex-shrink-0 text-right">
                      {item.time ? (
                        <span className="text-[11px] font-mono text-muted-foreground">{item.time}</span>
                      ) : (
                        <span className="text-[9px] font-mono text-muted-foreground/70 uppercase">All day</span>
                      )}
                    </div>
                    <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: ev.color || '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{ev.title}</p>
                      {ev.location && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5" />{ev.location}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                  </div>
                );
              }

              // Task item
              const t = item.data;
              return (
                <div key={t.id || i} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-secondary/30 group">
                  <div className="w-12 flex-shrink-0 text-right">
                    {t.isNeedleMover ? (
                      <Zap className="w-3 h-3 text-primary ml-auto" />
                    ) : (
                      <span className="text-[9px] font-mono text-muted-foreground/70 uppercase">Task</span>
                    )}
                  </div>
                  <div className="w-0.5 self-stretch rounded-full bg-amber-400/50 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] truncate ${t.isNeedleMover ? 'font-bold' : 'font-medium'}`}>{t.title}</p>
                    {t.isNeedleMover && mission?.needleMover?.reason && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{mission.needleMover.reason}</p>
                    )}
                    {t.sourceEmail && (
                      <p className="text-[9px] text-primary/60 mt-0.5 flex items-center gap-1 truncate">
                        <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{t.sourceEmail.subject}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {t.pillar && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PILLAR_COLORS[t.pillar] || '#666' }} />
                    )}
                    {t.id && (
                      <button
                        onClick={() => completeTask(t.id)}
                        disabled={completingTask === t.id}
                        className="p-1 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        {completingTask === t.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-primary/40 hover:text-primary" />}
                      </button>
                    )}
                    {t.triageStatus === 'pending' && t.id && (
                      <button
                        onClick={() => dismissTask(t.id)}
                        disabled={dismissingTask === t.id}
                        className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        {dismissingTask === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 text-muted-foreground hover:text-red-400" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ 4. DAILY BRIEFING ═══ */}
      <section className="game-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sunrise className="w-4 h-4 text-amber-400" />
            <h2 className="font-display font-bold text-sm">Daily Briefing</h2>
          </div>
          <button
            onClick={generateBriefing}
            disabled={generatingBriefing}
            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 disabled:opacity-50"
          >
            {generatingBriefing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {generatingBriefing ? 'Generating...' : 'Refresh'}
          </button>
        </div>

        {briefing?.text ? (
          <div>
            <div className={`text-[12px] leading-relaxed text-muted-foreground whitespace-pre-line ${
              showFullBriefing ? '' : 'line-clamp-4'
            }`}>
              {briefing.text}
            </div>
            {briefing.text.length > 200 && (
              <button
                onClick={() => setShowFullBriefing(!showFullBriefing)}
                className="text-[10px] text-primary mt-1 hover:underline"
              >
                {showFullBriefing ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={generateBriefing}
            disabled={generatingBriefing}
            className="w-full bg-amber-50 dark:bg-amber-950/20 border border-dashed border-amber-300/40 rounded-xl p-4 text-center hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors"
          >
            <Sparkles className="w-5 h-5 text-amber-400/60 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">
              {generatingBriefing ? 'Jarvis is writing your briefing...' : 'Tap to generate your morning briefing'}
            </p>
          </button>
        )}
      </section>

      {/* ═══ 5. KEYSTONE HABITS ═══ */}
      {habitsTotal > 0 && (
        <section className="game-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Flame className={`w-4 h-4 ${allHabitsDone ? 'text-orange-400' : 'text-muted-foreground'}`} />
              <h2 className="font-display font-bold text-sm">Habits</h2>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                allHabitsDone
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-muted-foreground'
              }`}>{habitsDoneToday}/{habitsTotal}</span>
            </div>
            <button onClick={() => onNavigate('habits')} className="text-[10px] text-primary hover:underline">
              Manage
            </button>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${habitProgress}%` }} />
          </div>
          <div className="space-y-0.5">
            {sortedHabits.map((h: any) => (
              <button key={h.id} onClick={() => toggleHabit(h.id)}
                disabled={togglingHabit === h.id}
                className={`flex items-center gap-2.5 w-full p-2 rounded-lg transition-all text-left ${
                  h.doneToday ? 'opacity-50' : 'hover:bg-secondary/30'
                }`}>
                <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
                  h.doneToday ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                  {togglingHabit === h.id
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : h.doneToday && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className={`text-[13px] flex-1 ${h.doneToday ? 'line-through text-muted-foreground' : ''}`}>{h.title}</span>
                {h.streak > 0 && (
                  <span className="text-[9px] font-mono text-orange-400 flex items-center gap-0.5">
                    <Flame className="w-2.5 h-2.5" />{h.streak}
                  </span>
                )}
                {h.pillar && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PILLAR_COLORS[h.pillar] || '#666' }} />
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 6. JARVIS SAYS (attention) ═══ */}
      {attention.length > 0 && (
        <section className="game-card p-4 sm:p-5 border-l-[3px] border-l-amber-400">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="font-display font-bold text-sm">Jarvis Says</h2>
              <span className="text-[10px] font-mono text-amber-500 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                {attention.length}
              </span>
            </div>
            <button onClick={fetchAll} className="text-[10px] text-muted-foreground hover:text-primary">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {attention.map((item: any, i: number) => {
              const Icon = ATTENTION_ICONS[item.type] || AlertTriangle;
              return (
                <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg ${
                  item.severity === 'high' ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-secondary/30'
                }`}>
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${
                    item.severity === 'high' ? 'text-red-500' : 'text-amber-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-snug truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                  </div>
                  <button
                    onClick={() => handleAttentionAction(item)}
                    className="text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md transition-colors flex-shrink-0"
                  >
                    {item.actionLabel || 'View'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ 7. MOMENTUM ═══ */}
      {momentum && (
        <section className="game-card p-4 sm:p-5">
          <button onClick={() => setShowMomentum(!showMomentum)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="font-display font-bold text-sm">Momentum</h2>
              {!showMomentum && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {momentum.tasksCompletedToday} done · {momentum.bestStreak > 0 ? `${momentum.bestStreak}d streak` : 'no streaks'}
                </span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showMomentum ? 'rotate-180' : ''}`} />
          </button>
          {showMomentum && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold font-mono text-primary">{momentum.tasksCompletedToday}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Done today</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold font-mono">{momentum.habitsDoneToday}/{momentum.habitsTotal}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Habits</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-center gap-0.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    <p className="text-lg font-bold font-mono">{momentum.bestStreak}</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Best streak</p>
                </div>
              </div>
              {momentum.goalsProgress?.length > 0 && (
                <div className="space-y-1.5">
                  {momentum.goalsProgress.slice(0, 4).map((g: any) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <Target className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-[11px] flex-1 truncate">{g.title}</span>
                      {g.target && g.unit ? (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {g.unit === '$' ? `$${(g.current || 0).toLocaleString()}/$${g.target.toLocaleString()}` : `${g.current || 0}/${g.target}${g.unit}`}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground">{g.progress || 0}%</span>
                      )}
                      <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(g.progress || 0, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {momentum.scoreChange && momentum.scoreChange.current > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>Life Score: <strong>{momentum.scoreChange.current}</strong></span>
                  {momentum.scoreChange.delta !== 0 && (
                    <span className={momentum.scoreChange.delta > 0 ? 'text-emerald-500' : 'text-red-400'}>
                      {momentum.scoreChange.delta > 0 ? '+' : ''}{momentum.scoreChange.delta}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══ 8. QUICK ACTIONS ═══ */}
      <section className="grid grid-cols-4 gap-2">
        {[
          { key: 'journal', icon: BookOpen, label: 'Journal', color: 'text-indigo-400' },
          { key: 'finance', icon: DollarSign, label: 'Finance', color: 'text-green-500' },
          { key: 'people', icon: Users, label: 'People', color: 'text-pink-400' },
          { key: 'goals', icon: Target, label: 'Goals', color: 'text-amber-500' },
        ].map(({ key, icon: Icon, label, color }) => (
          <button key={key} onClick={() => onNavigate(key)}
            className="game-card p-3 text-center hover:shadow-md transition-all group">
            <Icon className={`w-5 h-5 ${color} mx-auto mb-1 group-hover:scale-110 transition-transform`} />
            <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
          </button>
        ))}
      </section>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-sm p-4 pb-6 sm:pb-4" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-6 rounded-full" style={{ backgroundColor: selectedEvent.color || '#6366f1' }} />
                <h3 className="text-sm font-display font-bold">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {selectedEvent.allDay
                    ? 'All day'
                    : `${new Date(selectedEvent.startTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })}${selectedEvent.endTime ? ` – ${new Date(selectedEvent.endTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}`
                  }
                </span>
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent.description && (
                <p className="text-[11px] text-muted-foreground/80 bg-secondary/30 rounded-lg p-2.5 leading-relaxed">{selectedEvent.description}</p>
              )}
            </div>

            <div className="flex gap-2">
              <a
                href={buildGoogleCalendarUrl(selectedEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-all"
              >
                <Calendar className="w-3.5 h-3.5" /> Open in Google Calendar
              </a>
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
