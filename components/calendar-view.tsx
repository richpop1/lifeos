'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight, Plus, X, Loader2,
  Link2, Globe, Trash2, RefreshCw, Clock, MapPin, Target, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { buildGoogleCalendarUrl } from '@/lib/google-calendar-url';

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  color?: string;
  source: string;
  goalId?: string;
  taskId?: string;
  task?: { id: string; title: string; status: string };
  habitId?: string;
  habitDone?: boolean;
}

interface CalSub {
  id: string;
  name: string;
  url: string;
  color: string;
  isActive: boolean;
  lastSynced?: string;
}

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [subs, setSubs] = useState<CalSub[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [view, setView] = useState<'month' | 'week'>('week');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [showAddSub, setShowAddSub] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [newEvent, setNewEvent] = useState({ title: '', startTime: '', endTime: '', description: '', location: '', goalId: '', allDay: false });
  const [editEvent, setEditEvent] = useState<{ id: string; title: string; startTime: string; endTime: string; description: string; location: string } | null>(null);
  const [newSub, setNewSub] = useState({ name: '', url: '', color: '#6366f1' });

  useEffect(() => {
    setMounted(true);
    setCurrentDate(new Date());
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!currentDate) return;
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    if (view === 'week') {
      start.setDate(start.getDate() - start.getDay());
      end.setDate(start.getDate() + 7);
    } else {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    }
    try {
      const res = await fetch(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`);
      if (res.ok) setEvents(await res.json());
    } catch (e) { console.error(e); }
  }, [currentDate, view]);

  const fetchSubs = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/subscriptions');
      if (res.ok) setSubs(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) setGoals(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchSubs(); fetchGoals(); }, [fetchSubs, fetchGoals]);

  // Auto-sync subscriptions that haven't been synced in the last hour
  useEffect(() => {
    if (subs.length === 0) return;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stale = subs.filter((s: any) => !s.lastSynced || new Date(s.lastSynced) < oneHourAgo);
    if (stale.length > 0) {
      (async () => {
        for (const s of stale) await syncSub(s.id);
      })();
    }
  }, [subs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (dir: number) => {
    if (!currentDate) return;
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const weekDays = useMemo(() => {
    if (!currentDate) return [];
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const monthDays = useMemo(() => {
    if (!currentDate) return [];
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startPad = first.getDay();
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let i = 1; i <= lastDay; i++) days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    return days;
  }, [currentDate]);

  const getEventsForDay = (day: Date) => {
    const dayStr = day.toISOString().split('T')[0];
    return events.filter(e => e.startTime && new Date(e.startTime).toISOString().split('T')[0] === dayStr);
  };

  const isToday = (d: Date) => {
    if (!mounted) return false;
    const now = new Date();
    return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
  };

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.startTime) { toast.error('Title and start time required'); return; }
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });
      if (res.ok) {
        toast.success('Event added');
        setShowAddEvent(false);
        setNewEvent({ title: '', startTime: '', endTime: '', description: '', location: '', goalId: '', allDay: false });
        fetchEvents();
      }
    } catch { toast.error('Failed'); }
  };

  const handleAddSub = async () => {
    if (!newSub.name || !newSub.url) { toast.error('Name and URL required'); return; }
    try {
      const res = await fetch('/api/calendar/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSub),
      });
      if (res.ok) {
        const sub = await res.json();
        toast.success('Calendar subscribed!');
        setShowAddSub(false);
        setNewSub({ name: '', url: '', color: '#6366f1' });
        fetchSubs();
        // Auto-sync
        syncSub(sub.id);
      }
    } catch { toast.error('Failed'); }
  };

  const syncSub = async (subId: string) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needsAttention) {
        toast.error(data.error || 'Calendar URL needs attention', { duration: 10000 });
      } else if (res.ok) {
        toast.success(`Synced ${data.synced} events`);
        fetchEvents();
        fetchSubs();
      } else {
        toast.error(data?.error || 'Sync failed');
      }
    } catch { toast.error('Sync failed'); }
    setSyncing(false);
  };

  const syncAll = async () => {
    for (const s of subs.filter(s => s.isActive)) {
      await syncSub(s.id);
    }
  };

  const deleteSub = async (id: string) => {
    if (!confirm('Remove this calendar subscription?')) return;
    try {
      await fetch(`/api/calendar/subscriptions?id=${id}`, { method: 'DELETE' });
      toast.success('Removed');
      fetchSubs();
      fetchEvents();
    } catch { toast.error('Failed'); }
  };

  const deleteEvent = async (id: string) => {
    try {
      await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE' });
      toast.success('Removed from calendar');
      fetchEvents();
    } catch { toast.error('Failed'); }
  };

  const canEdit = (e: CalEvent) => e.source === 'manual' || e.source === 'task';
  const canDelete = (e: CalEvent) => e.source === 'manual' || e.source === 'task';

  const openEdit = (e: CalEvent) => {
    const toLocal = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    setEditEvent({
      id: e.id,
      title: e.title,
      startTime: toLocal(e.startTime),
      endTime: e.endTime ? toLocal(e.endTime) : '',
      description: e.description || '',
      location: e.location || '',
    });
    setSelectedEvent(null);
  };

  const handleEditEvent = async () => {
    if (!editEvent) return;
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEvent.id,
          title: editEvent.title,
          startTime: editEvent.startTime ? new Date(editEvent.startTime).toISOString() : undefined,
          endTime: editEvent.endTime ? new Date(editEvent.endTime).toISOString() : undefined,
          description: editEvent.description || undefined,
          location: editEvent.location || undefined,
        }),
      });
      if (res.ok) {
        toast.success('Event updated');
        setEditEvent(null);
        fetchEvents();
      } else {
        toast.error('Update failed');
      }
    } catch { toast.error('Failed'); }
  };

  const formatTime = (d: string) => {
    if (!mounted) return '--:--';
    return new Date(d).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const headerLabel = useMemo(() => {
    if (!currentDate || !mounted) return '';
    if (view === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (!start || !end) return '';
      return `${start.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-SG', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
  }, [currentDate, view, weekDays, mounted]);

  if (!mounted || !currentDate) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight flex items-center gap-2">
            <CalIcon className="w-5 h-5 text-primary" /> Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your week at a glance, anchored to your North Star.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Globe className="w-3.5 h-3.5 mr-1" /> Subscriptions
          </Button>
          <Button variant="outline" size="sm" onClick={syncAll} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sync
          </Button>
          <Button size="sm" onClick={() => setShowAddEvent(true)}>
            <Plus className="w-4 h-4 mr-1" /> Event
          </Button>
        </div>
      </div>

      {/* View toggle + navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          <button onClick={() => setView('week')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'week' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>Week</button>
          <button onClick={() => setView('month')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'month' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>Month</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCurrentDate(new Date())} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-secondary">Today</button>
          <span className="text-sm font-medium min-w-[180px] text-center">{headerLabel}</span>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Subscriptions panel */}
      {showSettings && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Calendar Subscriptions</h3>
            <button onClick={() => setShowSettings(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[10px] text-muted-foreground">{s.lastSynced ? `Synced ${new Date(s.lastSynced).toLocaleDateString()}` : 'Never synced'}</span>
              <button onClick={() => syncSub(s.id)} className="p-1 hover:text-primary"><RefreshCw className="w-3 h-3" /></button>
              <button onClick={() => deleteSub(s.id)} className="p-1 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          {!showAddSub ? (
            <Button variant="outline" size="sm" onClick={() => setShowAddSub(true)} className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1" /> Subscribe to Calendar
            </Button>
          ) : (
            <div className="space-y-2 p-3 rounded-lg bg-secondary/30">
              <Input placeholder="Calendar name" value={newSub.name}
                onChange={(e: any) => setNewSub(s => ({ ...s, name: e.target.value }))} />
              <Input placeholder="iCal URL (https://...)" value={newSub.url}
                onChange={(e: any) => setNewSub(s => ({ ...s, url: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Get your iCal URL from Google Calendar: Settings → Calendar → "Secret address in iCal format"</p>
              <div className="flex items-center gap-2">
                <input type="color" value={newSub.color} onChange={(e) => setNewSub(s => ({ ...s, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer" />
                <Button onClick={handleAddSub} size="sm" className="flex-1">Subscribe</Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddSub(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Week view */}
      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-[10px] text-center font-medium text-muted-foreground uppercase py-1">{d}</div>
          ))}
          {weekDays.map((day, i) => {
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            const isSelected = selectedDay && day.toDateString() === selectedDay.toDateString();
            return (
              <div key={i} onClick={() => setSelectedDay(day)} className={`min-h-[120px] rounded-xl border p-2 transition-colors cursor-pointer ${
                isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : today ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:border-primary/30'
              }`}>
                <div className={`text-xs font-mono mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 4).map(e => (
                    <div key={e.id} className="group flex items-start gap-1 text-[10px] p-1 rounded-md hover:bg-secondary/50 cursor-pointer" onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}>
                      <span className="w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: e.color || 'var(--primary)' }} />
                      <span className="truncate flex-1">{e.source === 'task' ? `📋 ${e.title}` : e.title}</span>
                      {canDelete(e) && (
                        <button onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }} className="hidden group-hover:block flex-shrink-0">
                          <X className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}
                  {dayEvents.length > 4 && (
                    <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 4} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month view */}
      {view === 'month' && (
        <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-[10px] text-center font-medium text-muted-foreground uppercase py-2 bg-card">{d}</div>
          ))}
          {monthDays.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="min-h-[80px] bg-secondary/20" />;
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            return (
              <div key={i} onClick={() => { setSelectedDay(day); setView('week'); setCurrentDate(new Date(day)); }} className={`min-h-[80px] p-1.5 bg-card cursor-pointer hover:bg-primary/5 ${today ? 'ring-1 ring-inset ring-primary/40' : ''}`}>
                <div className={`text-[10px] font-mono mb-0.5 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {day.getDate()}
                </div>
                {dayEvents.slice(0, 3).map(e => (
                  <div key={e.id} className="text-[9px] truncate px-1 py-0.5 rounded mb-0.5" style={{ backgroundColor: (e.color || '#6366f1') + '20', color: e.color || '#6366f1' }}>
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected day or today's agenda */}
      {view === 'week' && (() => {
        const agendaDate = selectedDay || new Date();
        const agendaStr = agendaDate.toISOString().split('T')[0];
        const agendaEvents = events.filter(e => e.startTime && new Date(e.startTime).toISOString().split('T')[0] === agendaStr);
        const label = selectedDay ? selectedDay.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Today';
        if (!agendaEvents.length) return selectedDay ? <div className="text-center py-6 text-sm text-muted-foreground">No events on {label}</div> : null;
        return (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-primary" /> {label}&apos;s Agenda</h3>
            {agendaEvents.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border group cursor-pointer" onClick={() => setSelectedEvent(e)}>
                <span className="w-2 h-8 rounded-full" style={{ backgroundColor: e.color || 'var(--primary)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{e.source === 'task' ? `📋 ${e.title}` : e.title}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                    <span>{formatTime(e.startTime)}{e.endTime ? ` – ${formatTime(e.endTime)}` : ''}</span>
                    {e.location && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{e.location}</span>}
                    {e.source === 'task' && <span className="text-primary/70 font-medium">Task</span>}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                {canDelete(e) && (
                  <button onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }} className="p-1 text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Add event modal */}
      {showAddEvent && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddEvent(false)}>
          <div className="bg-card rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">New Event</h3>
              <button onClick={() => setShowAddEvent(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <Input placeholder="Event title" value={newEvent.title}
              onChange={(e: any) => setNewEvent(n => ({ ...n, title: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Start</label>
                <Input type="datetime-local" value={newEvent.startTime}
                  onChange={(e: any) => setNewEvent(n => ({ ...n, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">End</label>
                <Input type="datetime-local" value={newEvent.endTime}
                  onChange={(e: any) => setNewEvent(n => ({ ...n, endTime: e.target.value }))} />
              </div>
            </div>
            <Input placeholder="Location (optional)" value={newEvent.location}
              onChange={(e: any) => setNewEvent(n => ({ ...n, location: e.target.value }))} />
            <select value={newEvent.goalId} onChange={(e: any) => setNewEvent(n => ({ ...n, goalId: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="">Link to goal (optional)</option>
              {goals.filter((g: any) => g.status === 'active').map((g: any) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
            <textarea placeholder="Description (optional)" value={newEvent.description}
              onChange={(e) => setNewEvent(n => ({ ...n, description: e.target.value }))}
              className="w-full min-h-[60px] p-2 text-sm bg-background border border-input rounded-lg resize-none" />
            <Button onClick={handleAddEvent} className="w-full">Add Event</Button>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-sm p-4 pb-6 sm:pb-4" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-6 rounded-full" style={{ backgroundColor: selectedEvent.color || 'var(--primary)' }} />
                <h3 className="text-sm font-display font-bold">{selectedEvent.source === 'task' ? `📋 ${selectedEvent.title}` : selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {selectedEvent.allDay
                    ? 'All day'
                    : `${formatTime(selectedEvent.startTime)}${selectedEvent.endTime ? ` – ${formatTime(selectedEvent.endTime)}` : ''}`
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
              {selectedEvent.source === 'task' && (
                <p className="text-[10px] text-primary/70 font-medium">📋 Linked Task — completing the task removes it from calendar</p>
              )}
              {selectedEvent.source === 'subscription' && (
                <p className="text-[9px] text-muted-foreground/60">Source: Calendar subscription</p>
              )}
              {selectedEvent.source === 'habit' && (
                <p className="text-[9px] text-muted-foreground/60">Source: Habit {selectedEvent.habitDone ? '✅' : ''}</p>
              )}
            </div>

            <div className="flex gap-2">
              {canEdit(selectedEvent) && (
                <button
                  onClick={() => openEdit(selectedEvent)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-all"
                >
                  ✏️ Edit
                </button>
              )}
              {!canEdit(selectedEvent) && (
                <a
                  href={buildGoogleCalendarUrl(selectedEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-all"
                >
                  <CalIcon className="w-3.5 h-3.5" /> Open in Google Calendar
                </a>
              )}
              {canDelete(selectedEvent) && (
                <button
                  onClick={() => { deleteEvent(selectedEvent.id); setSelectedEvent(null); }}
                  className="px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/30 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  {selectedEvent.source === 'task' ? 'Unschedule' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editEvent && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setEditEvent(null)}>
          <div className="bg-card rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">Edit Event</h3>
              <button onClick={() => setEditEvent(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <Input placeholder="Event title" value={editEvent.title}
              onChange={(e: any) => setEditEvent(ev => ev ? { ...ev, title: e.target.value } : null)} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Start</label>
                <Input type="datetime-local" value={editEvent.startTime}
                  onChange={(e: any) => setEditEvent(ev => ev ? { ...ev, startTime: e.target.value } : null)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">End</label>
                <Input type="datetime-local" value={editEvent.endTime}
                  onChange={(e: any) => setEditEvent(ev => ev ? { ...ev, endTime: e.target.value } : null)} />
              </div>
            </div>
            <Input placeholder="Description (optional)" value={editEvent.description}
              onChange={(e: any) => setEditEvent(ev => ev ? { ...ev, description: e.target.value } : null)} />
            <Button onClick={handleEditEvent} className="w-full">Save Changes</Button>
          </div>
        </div>
      )}
    </div>
  );
}
