'use client';
import { useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Brain, CalendarDays, Check, CheckCircle2,
  ChevronRight, Circle, Clock, DollarSign, FolderKanban, Heart, ListChecks,
  Loader2, Mail, PlayCircle, Plus, StickyNote, Star, Target, Users, X, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export const PILLAR_COLORS: Record<string, string> = { wealth: '#5B9A8B', health: '#E8913A', relationship: '#D94F7A' };
export const PILLAR_ICONS: Record<string, any> = { wealth: DollarSign, health: Heart, relationship: Users };
export const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  defer: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};
export const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Urgent' }, high: { color: '#F97316', label: 'High' },
  medium: { color: '#F59E0B', label: 'Med' }, low: { color: '#22C55E', label: 'Low' },
};

// ════════════════════════════════════════════
// Task Detail Page (shared between Inbox & Goals)
// ════════════════════════════════════════════
export function TaskDetail({ task: initialTask, goals, onBack, onUpdate }: { task: any; goals: any[]; onBack: () => void; onUpdate: (t: any) => void }) {
  const [task, setTask] = useState(initialTask);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(initialTask.notes || '');
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const subtasks = (task.subtasks as any[]) || [];

  const save = async (data: any) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setTask(updated);
        onUpdate(updated);
      }
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleSubtask = (idx: number) => {
    const updated = subtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
    save({ subtasks: updated });
  };
  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    save({ subtasks: [...subtasks, { title: newSubtask.trim(), done: false }] });
    setNewSubtask('');
  };
  const removeSubtask = (idx: number) => {
    save({ subtasks: subtasks.filter((_, i) => i !== idx) });
  };
  const saveNotes = () => {
    save({ notes: notes || null });
    setEditingNotes(false);
  };

  const doneCount = subtasks.filter(s => s.done).length;
  const progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold">{task.title}</h1>
          {task.goal && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <ArrowUpRight className="w-3 h-3" /> {task.goal.title}
              <span className="px-1 py-0.5 bg-primary/10 text-primary rounded text-[10px]">w{task.goal.weight}</span>
            </p>
          )}
        </div>
        <button onClick={() => save({ status: task.status === 'done' ? 'todo' : 'done' })} className={`p-2 rounded-lg ${task.status === 'done' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary text-muted-foreground'}`}>
          {task.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>
      </div>

      {/* Meta badges */}
      <div className="flex flex-wrap gap-2">
        {task.aiUrgency && <span className={`text-xs px-2 py-1 rounded-lg font-medium ${URGENCY_COLORS[task.aiUrgency]}`}>{task.aiUrgency}</span>}
        {task.isNeedleMover && <span className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Needle Mover</span>}
        {task.pillar && <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{ backgroundColor: `${PILLAR_COLORS[task.pillar]}15`, color: PILLAR_COLORS[task.pillar] }}>{task.pillar}</span>}
        {task.northStarAlign && <span className="text-xs px-2 py-1 rounded-lg bg-secondary font-medium">⭐ {task.northStarAlign}/10 aligned</span>}
        {task.dueDate && <span className="text-xs px-2 py-1 rounded-lg bg-secondary font-medium flex items-center gap-1"><Clock className="w-3 h-3" />Due: {new Date(task.dueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        {task.startDate && <span className="text-xs px-2 py-1 rounded-lg bg-secondary font-medium flex items-center gap-1"><PlayCircle className="w-3 h-3" />Start: {new Date(task.startDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
        {task.scheduledStartTime && <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary font-medium flex items-center gap-1"><CalendarDays className="w-3 h-3" />{new Date(task.scheduledStartTime).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} {new Date(task.scheduledStartTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}{task.scheduledEndTime ? ` – ${new Date(task.scheduledEndTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>}
        {!task.scheduledStartTime && task.scheduledDate && <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary font-medium flex items-center gap-1"><CalendarDays className="w-3 h-3" />Scheduled: {new Date(task.scheduledDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
        {task.estimatedMins && <span className="text-xs px-2 py-1 rounded-lg bg-secondary font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{task.estimatedMins >= 60 ? `${Math.floor(task.estimatedMins / 60)}h${task.estimatedMins % 60 ? ` ${task.estimatedMins % 60}m` : ''}` : `${task.estimatedMins}m`} est</span>}
        {task.actualMins && <span className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{task.actualMins >= 60 ? `${Math.floor(task.actualMins / 60)}h${task.actualMins % 60 ? ` ${task.actualMins % 60}m` : ''}` : `${task.actualMins}m`} actual</span>}
      </div>

      {/* Source Email Link */}
      {task.sourceEmailId && (
        <button
          onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('navigate:email', { detail: { emailId: task.sourceEmailId } })); onBack(); }}
          className="game-card p-3 flex items-center gap-2.5 hover:ring-2 hover:ring-primary/20 transition-all w-full text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">Created from email</p>
            <p className="text-[10px] text-muted-foreground truncate">Tap to view original email thread</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      )}

      {/* Resolution & Contribution */}
      <div className="game-card p-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Resolution</label>
            <select value={task.resolution || ''} onChange={(e: any) => save({ resolution: e.target.value || null })} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
              <option value="">Open</option>
              <option value="completed">✅ Done</option>
              <option value="wont_do">⏭️ Won't do</option>
              <option value="delegated">🤝 Delegated</option>
              <option value="deferred">⏸️ Deferred</option>
              <option value="irrelevant">🗑️ Not relevant</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">How it helps</label>
            <select value={task.contributionType || ''} onChange={(e: any) => save({ contributionType: e.target.value || null })} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
              <option value="">—</option>
              <option value="direct">🎯 Moves the needle</option>
              <option value="enabler">🔧 Unblocks other work</option>
              <option value="maintenance">🔄 Keeps things running</option>
              <option value="exploratory">🔬 Research / learning</option>
            </select>
          </div>
        </div>
        {task.resolution === 'delegated' && (
          <Input placeholder="Delegated to..." value={task.delegatedTo || ''} onChange={(e: any) => save({ delegatedTo: e.target.value })} className="text-xs h-8" />
        )}
        {task.resolution && !['completed'].includes(task.resolution) && (
          <Input placeholder="Reason (optional)" value={task.resolvedReason || ''}
            onBlur={(e: any) => save({ resolvedReason: e.target.value || null })} className="text-xs h-8" />
        )}
        {task.resolution && task.resolution !== 'completed' && task.status !== 'done' && (
          <button
            onClick={() => save({ status: 'done' })}
            disabled={saving}
            className="w-full mt-1 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Resolve as "${task.resolution === 'wont_do' ? "Won't do" : task.resolution === 'deferred' ? 'Deferred' : task.resolution === 'delegated' ? 'Delegated' : 'Not relevant'}" & Close`}
          </button>
        )}
      </div>

      {/* AI Recommendation */}
      {task.aiRecommendation && (
        <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">AI Recommendation</span>
          </div>
          <p className="text-sm">{task.aiRecommendation}</p>
        </div>
      )}

      {/* Subtasks */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Subtasks</span>
            {subtasks.length > 0 && <span className="text-xs text-muted-foreground">{doneCount}/{subtasks.length}</span>}
          </div>
        </div>
        {subtasks.length > 0 && (
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="space-y-1.5">
          {subtasks.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 group">
              <button onClick={() => toggleSubtask(i)} className="text-muted-foreground hover:text-primary flex-shrink-0">
                {s.done ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4" />}
              </button>
              <span className={`text-sm flex-1 ${s.done ? 'line-through text-muted-foreground' : ''}`}>{s.title}</span>
              <button onClick={() => removeSubtask(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Input placeholder="Add subtask..." value={newSubtask} onChange={(e: any) => setNewSubtask(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') addSubtask(); }} className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={addSubtask} className="h-8"><Plus className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notes</span>
          </div>
          {!editingNotes && <button onClick={() => setEditingNotes(true)} className="text-xs text-primary hover:underline">Edit</button>}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none" placeholder="Add notes about this task..." />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNotes}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingNotes(false); setNotes(task.notes || ''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.notes || 'No notes yet. Tap Edit to add.'}</p>
        )}
      </div>

      {/* Duration Tracking */}
      {task.estimatedMins && task.status !== 'done' && (
        <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Time Tracking</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">AI estimated {task.estimatedMins >= 60 ? `${Math.floor(task.estimatedMins / 60)}h ${task.estimatedMins % 60}m` : `${task.estimatedMins}m`}. Log your actual time when done.</p>
          <div className="flex items-center gap-2">
            <Input type="number" placeholder="Actual minutes" min={1} max={480}
              defaultValue={task.actualMins || ''}
              onChange={(e: any) => { const v = parseInt(e.target.value); if (v > 0 && v <= 480) save({ actualMins: v }); }}
              className="h-8 text-sm w-32" />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// Task Form Modal (shared - richer version)
// ════════════════════════════════════════════
export function TaskFormModal({ goals, defaultGoalId, northStar, onClose, onSave }: {
  goals: any[]; defaultGoalId?: string; northStar?: string; onClose: () => void; onSave: (task?: any) => void;
}) {
  const [form, setForm] = useState({ title: '', pillar: '', priority: 'medium', isNeedleMover: false, goalId: defaultGoalId || '', dueDate: '', startDate: '', scheduledStartTime: '', scheduledEndTime: '', estimatedMins: '' });
  const [creating, setCreating] = useState(false);
  const submit = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          goalId: form.goalId || null,
          dueDate: form.dueDate || null,
          startDate: form.startDate || null,
          scheduledStartTime: form.scheduledStartTime || null,
          scheduledEndTime: form.scheduledEndTime || null,
          estimatedMins: form.estimatedMins ? parseInt(form.estimatedMins) : null,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        const subtaskCount = (task.subtasks as any[])?.length || 0;
        toast.success(subtaskCount > 0 ? `Task added with ${subtaskCount} AI subtasks` : 'Task added');
        onClose();
        onSave(task);
      }
    } catch { toast.error('Failed'); }
    finally { setCreating(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-sm p-5 pb-6 sm:pb-5" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold">New Task</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <Input placeholder="What needs to be done?" value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} autoFocus />
          <select value={form.goalId} onChange={(e: any) => setForm({ ...form, goalId: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">No linked goal</option>
            {goals.filter(g => g.status === 'active').map((g: any) => (
              <option key={g.id} value={g.id}>{g.isProject ? '📁 ' : ''}{g.title} (w{g.weight})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select value={form.priority} onChange={(e: any) => setForm({ ...form, priority: e.target.value })} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select value={form.pillar} onChange={(e: any) => setForm({ ...form, pillar: e.target.value })} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">No pillar</option>
              <option value="wealth">Wealth</option>
              <option value="health">Health</option>
              <option value="relationship">Relationship</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Start Date</label>
              <Input type="date" value={form.startDate} onChange={(e: any) => setForm({ ...form, startDate: e.target.value })} className="text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} className="text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">📅 Schedule Start</label>
              <Input type="datetime-local" value={form.scheduledStartTime} onChange={(e: any) => setForm({ ...form, scheduledStartTime: e.target.value })} className="text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">📅 Schedule End</label>
              <Input type="datetime-local" value={form.scheduledEndTime} onChange={(e: any) => setForm({ ...form, scheduledEndTime: e.target.value })} className="text-sm" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Estimated Minutes</label>
            <Input type="number" min={5} max={480} placeholder="e.g. 30" value={form.estimatedMins} onChange={(e: any) => setForm({ ...form, estimatedMins: e.target.value })} className="text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isNeedleMover} onChange={(e: any) => setForm({ ...form, isNeedleMover: e.target.checked })} className="accent-primary" />
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Needle Mover
          </label>
          {northStar && <p className="text-[9px] text-amber-600/70 flex items-center gap-1"><Target className="w-2.5 h-2.5" /> Does this align with: {northStar}?</p>}
          <Button onClick={submit} className="w-full" disabled={creating}>
            {creating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating + AI breakdown...</> : 'Add Task'}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">AI will auto-generate subtasks</p>
        </div>
      </div>
    </div>
  );
}
