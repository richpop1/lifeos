'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Star, Target, Sparkles,
  CheckCircle2, Circle, Clock
} from 'lucide-react';

interface Props {
  tasks: any[];
  habits: any[];
  goals: any[];
  northStar?: string;
  onNavigate: (tab: any) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekCalendar({ tasks, habits, goals, northStar, onNavigate }: Props) {
  const [mounted, setMounted] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => { setMounted(true); }, []);

  // Fetch calendar events for this week
  const weekDays = useMemo(() => {
    if (!mounted) return [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [mounted, weekOffset]);

  useEffect(() => {
    if (weekDays.length === 0) return;
    const start = weekDays[0];
    const end = weekDays[6];
    const endNext = new Date(end);
    endNext.setDate(endNext.getDate() + 1);
    fetch(`/api/calendar/events?start=${start.toISOString()}&end=${endNext.toISOString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {});
  }, [weekDays]);

  const todayStr = useMemo(() => mounted ? new Date().toISOString().split('T')[0] : '', [mounted]);

  const selectedDate = selectedDay !== null && weekDays[selectedDay] ? weekDays[selectedDay] : null;
  const selectedStr = selectedDate ? selectedDate.toISOString().split('T')[0] : todayStr;

  // Get tasks due on selected day or no due date (active)
  const dayTasks = useMemo(() => {
    return (tasks || []).filter(t => {
      if (t.status === 'done') return false;
      if (t.dueDate) {
        return new Date(t.dueDate).toISOString().split('T')[0] === selectedStr;
      }
      return true; // show undated tasks
    }).sort((a: any, b: any) => {
      const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, defer: 4 };
      return (urgencyOrder[a.aiUrgency || 'medium'] || 2) - (urgencyOrder[b.aiUrgency || 'medium'] || 2);
    });
  }, [tasks, selectedStr]);

  // Get habits (daily)
  const dayHabits = useMemo(() => {
    return (habits || []).map(h => {
      const done = (h.logs || []).some((l: any) => new Date(l.date).toISOString().split('T')[0] === selectedStr);
      return { ...h, done };
    });
  }, [habits, selectedStr]);

  // Events for selected day
  const dayEvents = useMemo(() => {
    return events.filter(e => new Date(e.startTime).toISOString().split('T')[0] === selectedStr);
  }, [events, selectedStr]);

  // Active goals
  const activeGoals = useMemo(() => (goals || []).filter((g: any) => g.status === 'active'), [goals]);

  // Task counts per day for indicator dots
  const dayIndicators = useMemo(() => {
    return weekDays.map(d => {
      const dStr = d.toISOString().split('T')[0];
      const taskCount = (tasks || []).filter((t: any) => t.status !== 'done' && t.dueDate && new Date(t.dueDate).toISOString().split('T')[0] === dStr).length;
      const eventCount = events.filter(e => new Date(e.startTime).toISOString().split('T')[0] === dStr).length;
      return { tasks: taskCount, events: eventCount };
    });
  }, [weekDays, tasks, events]);

  const urgencyColor = (u: string) => {
    switch (u) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-amber-500';
      case 'low': return 'text-green-500';
      case 'defer': return 'text-muted-foreground';
      default: return 'text-foreground';
    }
  };

  if (!mounted) return <div className="h-[200px] rounded-xl bg-card animate-pulse" />;

  return (
    <div className="game-card p-4 space-y-3">
      {/* North Star anchor */}
      {northStar && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
          <Star className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-[11px] font-medium text-primary truncate">{northStar}</span>
        </div>
      )}

      {/* Week nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">
            {weekDays[0]?.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })} – {weekDays[6]?.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(o => o - 1)} className="p-0.5 rounded hover:bg-secondary"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setWeekOffset(0); setSelectedDay(null); }} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-secondary">Today</button>
          <button onClick={() => setWeekOffset(o => o + 1)} className="p-0.5 rounded hover:bg-secondary"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const isToday = day.toISOString().split('T')[0] === todayStr;
          const isSelected = selectedDay === i;
          const ind = dayIndicators[i];
          return (
            <button key={i} onClick={() => setSelectedDay(i)}
              className={`flex flex-col items-center py-1.5 rounded-lg transition-all ${
                isSelected ? 'bg-primary text-primary-foreground shadow-md' :
                isToday ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
              }`}>
              <span className="text-[9px] font-medium uppercase">{DAY_NAMES[i]}</span>
              <span className={`text-sm font-bold ${isSelected ? '' : isToday ? 'text-primary' : ''}`}>{day.getDate()}</span>
              <div className="flex gap-0.5 mt-0.5">
                {ind && ind.tasks > 0 && <span className="w-1 h-1 rounded-full bg-amber-400" />}
                {ind && ind.events > 0 && <span className="w-1 h-1 rounded-full bg-indigo-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail: North Star > Goals > Habits > Tasks */}
      <div className="space-y-2">
        {/* Goals linked to today's tasks */}
        {activeGoals.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Target className="w-2.5 h-2.5" /> Active Goals
            </span>
            {activeGoals.slice(0, 3).map((g: any) => (
              <div key={g.id} className="text-[11px] flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full" style={{
                  backgroundColor: g.pillar === 'wealth' ? '#4ADE80' : g.pillar === 'health' ? '#FB923C' : g.pillar === 'relationship' ? '#F472B6' : '#888'
                }} />
                <span className="truncate">{g.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Habits */}
        {dayHabits.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Habits
            </span>
            {dayHabits.map(h => (
              <div key={h.id} className="text-[11px] flex items-center gap-1.5">
                {h.done ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Circle className="w-3 h-3 text-muted-foreground" />}
                <span className={h.done ? 'line-through text-muted-foreground' : ''}>{h.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Calendar Events */}
        {dayEvents.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Events
            </span>
            {dayEvents.slice(0, 3).map((e: any) => (
              <div key={e.id} className="text-[11px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || '#6366f1' }} />
                <span className="truncate">{e.title}</span>
                <span className="text-[9px] text-muted-foreground ml-auto">
                  {new Date(e.startTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tasks */}
        {dayTasks.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Tasks
            </span>
            {dayTasks.slice(0, 5).map((t: any) => (
              <div key={t.id} className="text-[11px] flex items-center gap-1.5">
                <Circle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{t.title}</span>
                {t.aiUrgency && (
                  <span className={`text-[9px] font-mono ${urgencyColor(t.aiUrgency)}`}>
                    {t.aiUrgency}
                  </span>
                )}
              </div>
            ))}
            {dayTasks.length > 5 && <span className="text-[9px] text-muted-foreground">+{dayTasks.length - 5} more</span>}
          </div>
        )}

        {dayTasks.length === 0 && dayHabits.length === 0 && dayEvents.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-2">Clear day — protect your focus.</p>
        )}
      </div>

      {/* Quick link */}
      <button onClick={() => onNavigate('calendar')}
        className="text-[10px] text-primary hover:underline w-full text-center pt-1">
        View full calendar →
      </button>
    </div>
  );
}
