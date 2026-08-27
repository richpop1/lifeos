'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Check, Flame, Trash2, Sparkles, Settings, ChevronRight,
  Calendar, Clock, BarChart3, Trophy, Target, Zap, ChevronLeft,
  Edit3, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const PILLAR_COLORS: Record<string, string> = {
  wealth: '#4ADE80',
  health: '#FB923C',
  relationship: '#F472B6',
};

const PILLAR_BG: Record<string, string> = {
  wealth: 'bg-green-50 dark:bg-green-950/20',
  health: 'bg-orange-50 dark:bg-orange-950/20',
  relationship: 'bg-pink-50 dark:bg-pink-950/20',
};

const HABIT_ICONS = ['🏋️', '📖', '🧘', '💧', '🏃', '✍️', '🎯', '💤', '🥗', '💊', '🧹', '📱', '🎹', '🌅', '🚶', '💰', '📞', '🧠'];
const HABIT_COLORS = ['#6B8F71', '#4ADE80', '#FB923C', '#F472B6', '#60A5FA', '#A78BFA', '#FBBF24', '#F87171', '#34D399', '#818CF8'];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Every day', desc: '7 days a week' },
  { value: 'weekdays', label: 'Weekdays', desc: 'Mon–Fri' },
  { value: 'custom', label: 'Custom', desc: 'Choose days' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORTS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface HabitData {
  id: string;
  title: string;
  description?: string;
  pillar?: string;
  frequency: string;
  customDays?: number[];
  targetTime?: string;
  icon?: string;
  color?: string;
  goalId?: string;
  goal?: { id: string; title: string; pillar?: string } | null;
  isActive: boolean;
  sortOrder: number;
  logs: { id: string; date: string; done: boolean }[];
}

export function HabitsView() {
  const [habits, setHabits] = useState<HabitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editHabit, setEditHabit] = useState<HabitData | null>(null);
  const [subView, setSubView] = useState<'list' | 'detail'>('list');
  const [selectedHabit, setSelectedHabit] = useState<HabitData | null>(null);

  const [goals, setGoals] = useState<{ id: string; title: string; pillar?: string }[]>([]);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPillar, setFormPillar] = useState('');
  const [formFreq, setFormFreq] = useState('daily');
  const [formCustomDays, setFormCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formTargetTime, setFormTargetTime] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formColor, setFormColor] = useState('#6B8F71');
  const [formGoalId, setFormGoalId] = useState('');

  // Days
  const [days, setDays] = useState<string[]>([]);
  const [dayLabels, setDayLabels] = useState<string[]>([]);
  const [today, setToday] = useState('');

  useEffect(() => {
    const d: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      d.push(dt.toISOString().split('T')[0]);
    }
    setDays(d);
    setToday(d[d.length - 1]);
    setDayLabels(d.map(ds => {
      const date = new Date(ds + 'T00:00:00');
      return date.toLocaleDateString('en-SG', { weekday: 'short' }).slice(0, 2);
    }));
  }, []);

  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch('/api/habits');
      if (res.ok) {
        const data = await res.json();
        setHabits(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  const fetchGoals = useCallback(async () => {
    try {
      const r = await fetch('/api/goals');
      if (r.ok) {
        const data = await r.json();
        setGoals((data || []).filter((g: any) => g.status === 'active'));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchHabits(); fetchGoals(); }, [fetchHabits, fetchGoals]);

  // Stats computations
  const stats = useMemo(() => {
    if (habits.length === 0 || days.length === 0) return { totalStreak: 0, completionRate: 0, bestStreak: 0, todayDone: 0, todayTotal: 0 };

    let todayDone = 0;
    let todayTotal = habits.length;
    let totalStreak = 0;
    let bestStreak = 0;

    for (const h of habits) {
      const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);
      if (logs.includes(today)) todayDone++;

      // Current streak
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        if (logs.includes(days[i])) streak++;
        else break;
      }
      totalStreak = Math.max(totalStreak, streak);

      // Best streak (simple calc over 7 days)
      let maxS = 0, curS = 0;
      for (let i = 0; i < days.length; i++) {
        if (logs.includes(days[i])) { curS++; maxS = Math.max(maxS, curS); }
        else curS = 0;
      }
      bestStreak = Math.max(bestStreak, maxS);
    }

    const totalPossible = habits.reduce((sum, h) => {
      if (h.frequency === 'weekdays') return sum + 5;
      if (h.frequency === 'custom' && Array.isArray(h.customDays)) return sum + h.customDays.length;
      return sum + 7;
    }, 0);
    const totalDone = habits.reduce((sum, h) => {
      const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);
      return sum + days.filter(d => logs.includes(d)).length;
    }, 0);
    const completionRate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

    return { totalStreak, completionRate, bestStreak, todayDone, todayTotal };
  }, [habits, days, today]);

  const addHabit = async () => {
    if (!formTitle.trim()) return;
    try {
      const body: any = {
        title: formTitle,
        description: formDescription || null,
        pillar: formPillar || null,
        frequency: formFreq,
        customDays: formFreq === 'custom' ? formCustomDays : null,
        targetTime: formTargetTime || null,
        icon: formIcon || null,
        color: formColor || null,
        goalId: formGoalId || null,
      };
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Habit created!');
        resetForm();
        setShowAdd(false);
        fetchHabits();
      }
    } catch { toast.error('Failed to create habit'); }
  };

  const updateHabit = async () => {
    if (!editHabit || !formTitle.trim()) return;
    try {
      const body: any = {
        title: formTitle,
        description: formDescription || null,
        pillar: formPillar || null,
        frequency: formFreq,
        customDays: formFreq === 'custom' ? formCustomDays : null,
        targetTime: formTargetTime || null,
        icon: formIcon || null,
        color: formColor || null,
        goalId: formGoalId || null,
      };
      const res = await fetch(`/api/habits/${editHabit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Habit updated');
        resetForm();
        setEditHabit(null);
        fetchHabits();
      }
    } catch { toast.error('Failed'); }
  };

  const deleteHabit = async (id: string) => {
    try {
      await fetch(`/api/habits/${id}`, { method: 'DELETE' });
      setEditHabit(null);
      setSelectedHabit(null);
      setSubView('list');
      fetchHabits();
    } catch { /* silent */ }
  };

  const toggleHabit = async (habitId: string, date: string) => {
    try {
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date }),
      });
      fetchHabits();
    } catch { /* silent */ }
  };

  const resetForm = () => {
    setFormTitle(''); setFormDescription(''); setFormPillar('');
    setFormFreq('daily'); setFormCustomDays([1, 2, 3, 4, 5]);
    setFormTargetTime(''); setFormIcon(''); setFormColor('#6B8F71');
    setFormGoalId('');
  };

  const openEdit = (h: HabitData) => {
    setEditHabit(h);
    setFormTitle(h.title);
    setFormDescription(h.description || '');
    setFormPillar(h.pillar || '');
    setFormFreq(h.frequency || 'daily');
    setFormCustomDays(Array.isArray(h.customDays) ? h.customDays : [1, 2, 3, 4, 5]);
    setFormTargetTime(h.targetTime || '');
    setFormIcon(h.icon || '');
    setFormColor(h.color || '#6B8F71');
    setFormGoalId(h.goalId || '');
  };

  const getHabitStreak = (h: HabitData) => {
    const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (logs.includes(days[i])) streak++;
      else break;
    }
    return streak;
  };

  const getWeekTarget = (h: HabitData): number => {
    if (h.frequency === 'weekdays') return 5;
    if (h.frequency === 'custom' && Array.isArray(h.customDays)) return h.customDays.length;
    return 7; // daily
  };

  const getCompletionCount = (h: HabitData) => {
    const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);
    return days.filter(d => logs.includes(d)).length;
  };

  const isDoneToday = (h: HabitData) => {
    const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);
    return logs.includes(today);
  };

  // === DETAIL VIEW ===
  if (subView === 'detail' && selectedHabit) {
    const h = habits.find(hh => hh.id === selectedHabit.id) || selectedHabit;
    const streak = getHabitStreak(h);
    const completions = getCompletionCount(h);
    const weekTarget = getWeekTarget(h);
    const hColor = h.color || PILLAR_COLORS[h.pillar || ''] || '#6B8F71';
    const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);

    return (
      <div className="space-y-4">
        <button onClick={() => { setSubView('list'); setSelectedHabit(null); }} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" />Back to Habits
        </button>

        {/* Habit header card */}
        <div className="game-card p-5" style={{ borderLeft: `4px solid ${hColor}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{h.icon || '✨'}</span>
              <div>
                <h2 className="font-display font-bold text-lg">{h.title}</h2>
                {h.description && <p className="text-[11px] text-muted-foreground mt-0.5">{h.description}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {h.pillar && <span className="text-[9px] px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${PILLAR_COLORS[h.pillar]}20`, color: PILLAR_COLORS[h.pillar] }}>{h.pillar}</span>}
                  <span className="text-[9px] text-muted-foreground capitalize">{h.frequency === 'custom' ? `${(h.customDays || []).map(d => DAY_SHORTS[d]).join(', ')}` : h.frequency}</span>
                  {h.targetTime && <span className="text-[9px] text-muted-foreground">@ {h.targetTime}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(h)} className="p-2 rounded-lg hover:bg-secondary">
                <Edit3 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="game-card p-3 text-center">
            <div className="text-xl font-bold font-mono" style={{ color: hColor }}>{streak}</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">Current Streak</div>
          </div>
          <div className="game-card p-3 text-center">
            <div className="text-xl font-bold font-mono" style={{ color: hColor }}>{completions}/{weekTarget}</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">This Week</div>
          </div>
          <div className="game-card p-3 text-center">
            <div className="text-xl font-bold font-mono" style={{ color: hColor }}>{weekTarget > 0 ? Math.round((completions / weekTarget) * 100) : 0}%</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">Completion</div>
          </div>
        </div>

        {/* Week tracker */}
        <div className="game-card p-4">
          <h3 className="font-display font-bold text-sm mb-3">This Week</h3>
          <div className="flex justify-between">
            {days.map((day, i) => {
              const done = logs.includes(day);
              const isToday = day === today;
              return (
                <button key={day} onClick={() => toggleHabit(h.id, day)} className="flex flex-col items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{dayLabels[i]}</span>
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
                      ${done ? '' : isToday ? 'border-2 border-dashed' : 'border border-border'}
                    `}
                    style={done ? { backgroundColor: hColor } : isToday ? { borderColor: hColor } : {}}
                  >
                    {done && <Check className="w-5 h-5 text-white" />}
                  </motion.div>
                  <span className="text-[9px] text-muted-foreground">{new Date(day + 'T00:00:00').getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Linked goal */}
        {h.goal && (
          <div className="game-card p-4 flex items-center gap-3">
            <Target className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Linked Goal</div>
              <div className="text-sm font-medium truncate">{h.goal.title}</div>
            </div>
            {h.goal.pillar && (
              <span className="text-[9px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: PILLAR_COLORS[h.goal.pillar] || '#6B8F71' }}>
                {h.goal.pillar}
              </span>
            )}
          </div>
        )}

        {/* Danger zone */}
        <div className="game-card p-4">
          <button onClick={() => deleteHabit(h.id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
            <Trash2 className="w-3 h-3" />Delete this habit
          </button>
        </div>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground mt-1">Small consistent actions compound into big results.</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Habit
        </Button>
      </div>

      {/* Stats cards */}
      {habits.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="game-card p-3 text-center">
            <div className="text-lg font-bold font-mono text-primary">{stats.todayDone}/{stats.todayTotal}</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">Today</div>
          </div>
          <div className="game-card p-3 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-lg font-bold font-mono text-orange-500">{stats.totalStreak}</span>
            </div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">Best Streak</div>
          </div>
          <div className="game-card p-3 text-center">
            <div className="text-lg font-bold font-mono text-primary">{stats.completionRate}%</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">This Week</div>
          </div>
          <div className="game-card p-3 text-center">
            <div className="text-lg font-bold font-mono text-amber-500">{stats.bestStreak}d</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase">Record</div>
          </div>
        </div>
      )}

      {/* Today's progress bar */}
      {habits.length > 0 && (
        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Today's Progress</span>
            <span className="text-xs text-muted-foreground">{stats.todayDone} of {stats.todayTotal} complete</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${stats.todayTotal > 0 ? (stats.todayDone / stats.todayTotal) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Habits list */}
      {habits.length === 0 ? (
        <div className="game-card p-10 text-center">
          <Target className="w-10 h-10 text-primary/30 mx-auto mb-3" />
          <p className="font-display font-semibold text-lg mb-1">No habits yet</p>
          <p className="text-sm text-muted-foreground mb-4">Start tracking daily routines to build momentum.</p>
          <Button onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Create your first habit
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {habits.map((h) => {
            const hColor = h.color || PILLAR_COLORS[h.pillar || ''] || '#6B8F71';
            const streak = getHabitStreak(h);
            const doneToday = isDoneToday(h);
            const logs = (h.logs ?? []).map(l => new Date(l.date).toISOString().split('T')[0]);

            return (
              <div key={h.id} className="game-card overflow-hidden" style={{ borderLeft: `3px solid ${hColor}` }}>
                <div className="flex items-center p-3 gap-3">
                  {/* Today's toggle (big, prominent) */}
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => { e.stopPropagation(); toggleHabit(h.id, today); }}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0
                      ${doneToday ? 'shadow-md' : 'border-2 border-dashed'}
                    `}
                    style={doneToday ? { backgroundColor: hColor } : { borderColor: `${hColor}60` }}
                  >
                    {doneToday ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}>
                        <Check className="w-5 h-5 text-white" />
                      </motion.div>
                    ) : null}
                  </motion.button>

                  {/* Habit info */}
                  <button
                    onClick={() => { setSelectedHabit(h); setSubView('detail'); }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-1.5">
                      {h.icon && <span className="text-sm">{h.icon}</span>}
                      <span className="text-sm font-semibold truncate">{h.title}</span>
                      {streak >= 3 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500">
                          <Flame className="w-3 h-3" />{streak}
                        </span>
                      )}
                    </div>
                    {h.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{h.description}</p>}
                  </button>

                  {/* Mini week dots */}
                  <div className="flex gap-1 flex-shrink-0">
                    {days.slice(0, 6).map((day) => {
                      const done = logs.includes(day);
                      return (
                        <div key={day} className={`w-2 h-2 rounded-full transition-all
                          ${done ? '' : 'bg-border'}
                        `} style={done ? { backgroundColor: hColor } : {}} />
                      );
                    })}
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Habit Modal */}
      <AnimatePresence>
        {(showAdd || editHabit) && (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => { setShowAdd(false); setEditHabit(null); resetForm(); }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
              onClick={(e: any) => e.stopPropagation()}
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg">{editHabit ? 'Edit Habit' : 'New Habit'}</h3>
                  <button onClick={() => { setShowAdd(false); setEditHabit(null); resetForm(); }}>
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Title */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Habit name</label>
                  <Input
                    value={formTitle}
                    onChange={(e: any) => setFormTitle(e.target.value)}
                    placeholder="e.g. Morning workout, Read 30 min"
                    className="mt-1"
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Description (optional)</label>
                  <Input
                    value={formDescription}
                    onChange={(e: any) => setFormDescription(e.target.value)}
                    placeholder="Why this habit matters"
                    className="mt-1"
                  />
                </div>

                {/* Icon picker */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Icon</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {HABIT_ICONS.map(ic => (
                      <button key={ic}
                        onClick={() => setFormIcon(formIcon === ic ? '' : ic)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all
                          ${formIcon === ic ? 'bg-primary/10 ring-2 ring-primary' : 'bg-secondary hover:bg-secondary/80'}
                        `}
                      >{ic}</button>
                    ))}
                  </div>
                </div>

                {/* Color picker */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Color</label>
                  <div className="flex gap-2 mt-1">
                    {HABIT_COLORS.map(c => (
                      <button key={c}
                        onClick={() => setFormColor(c)}
                        className={`w-7 h-7 rounded-full transition-all ${formColor === c ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`}
                        style={{ backgroundColor: c, ...(formColor === c ? { ringColor: c } : {}) }}
                      />
                    ))}
                  </div>
                </div>

                {/* Pillar */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Life pillar</label>
                  <div className="flex gap-2 mt-1">
                    {['', 'wealth', 'health', 'relationship'].map(p => (
                      <button key={p}
                        onClick={() => setFormPillar(p)}
                        className={`text-xs px-3 py-1.5 rounded-full transition-all
                          ${formPillar === p ? 'text-white' : 'bg-secondary text-foreground'}
                        `}
                        style={formPillar === p ? { backgroundColor: p ? PILLAR_COLORS[p] : '#6B8F71' } : {}}
                      >{p || 'None'}</button>
                    ))}
                  </div>
                </div>

                {/* Linked Goal */}
                {goals.length > 0 && (
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Linked Goal (optional)</label>
                    <select value={formGoalId} onChange={(e: any) => setFormGoalId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">No goal</option>
                      {goals.map(g => (
                        <option key={g.id} value={g.id}>{g.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Frequency */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Frequency</label>
                  <div className="space-y-1.5 mt-1">
                    {FREQUENCY_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setFormFreq(opt.value)}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition-all
                          ${formFreq === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}
                        `}
                      >
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  {formFreq === 'custom' && (
                    <div className="flex gap-1.5 mt-2">
                      {DAY_NAMES.map((d, i) => (
                        <button key={i}
                          onClick={() => setFormCustomDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                          className={`w-9 h-9 rounded-lg text-[10px] font-medium transition-all
                            ${formCustomDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}
                          `}
                        >{d.slice(0, 2)}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Target time */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Preferred time (optional)</label>
                  <Input
                    type="time"
                    value={formTargetTime}
                    onChange={(e: any) => setFormTargetTime(e.target.value)}
                    className="mt-1 w-32"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {editHabit && (
                    <Button variant="destructive" size="sm" onClick={() => deleteHabit(editHabit.id)} className="mr-auto">
                      <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
                    </Button>
                  )}
                  <Button
                    onClick={editHabit ? updateHabit : addHabit}
                    disabled={!formTitle.trim()}
                    className="ml-auto"
                  >
                    {editHabit ? 'Save Changes' : 'Create Habit'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
