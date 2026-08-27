'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Target, CheckCircle2, Circle, Clock, Zap, Trash2, DollarSign, Heart,
  Users, X, ChevronRight, ChevronDown, FolderKanban, ArrowLeft, Sparkles,
  GripVertical, FileText, Loader2, Brain, Settings2, Weight, Star, Edit3,
  ListChecks, StickyNote, ArrowUpRight, CalendarDays, PlayCircle, Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { TaskDetail as SharedTaskDetail, TaskFormModal as SharedTaskFormModal, PILLAR_COLORS, PILLAR_ICONS, URGENCY_COLORS } from '@/components/task-components';

export function GoalsView() {
  const [goals, setGoals] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [showAiSettings, setShowAiSettings] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [gRes, tRes] = await Promise.all([fetch('/api/goals'), fetch('/api/tasks')]);
      if (gRes.ok) setGoals(await gRes.json().catch(() => []));
      if (tRes.ok) setTasks(await tRes.json().catch(() => []));
    } catch (e: any) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);


  const deleteGoal = async (id: string) => {
    if (!confirm('Delete this goal and unlink its tasks?')) return;
    try {
      await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      fetchData();
      if (selectedGoal?.id === id) setSelectedGoal(null);
    } catch { toast.error('Failed'); }
  };

  const activeGoals = goals.filter(g => g.status === 'active');
  const projects = activeGoals.filter(g => g.isProject);
  const regularGoals = activeGoals.filter(g => !g.isProject);

  // Task detail view
  if (selectedTask) {
    return <SharedTaskDetail task={selectedTask} goals={goals} onBack={() => { setSelectedTask(null); fetchData(); }} onUpdate={(t: any) => setSelectedTask(t)} />;
  }

  // Goal detail view
  if (selectedGoal) {
    return <GoalDetail goal={selectedGoal} tasks={tasks.filter(t => t.goalId === selectedGoal.id)} onBack={() => { setSelectedGoal(null); fetchData(); }} onTaskClick={setSelectedTask} onRefresh={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Strategy & direction. Tasks live in Inbox.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAiSettings(true)}>
            <Settings2 className="w-4 h-4 mr-1" /> AI Rules
          </Button>
        </div>
      </div>

      {/* Quick Add Row */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowAddGoal(true)}><Plus className="w-4 h-4 mr-1" /> Goal</Button>
      </div>

      {/* Projects Section */}
      {projects.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-muted-foreground" /> Projects
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((g: any) => <GoalCard key={g.id} goal={g} tasks={tasks} onClick={() => setSelectedGoal(g)} onDelete={() => deleteGoal(g.id)} />)}
          </div>
        </div>
      )}

      {/* Goals Section */}
      {regularGoals.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" /> Goals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regularGoals.map((g: any) => <GoalCard key={g.id} goal={g} tasks={tasks} onClick={() => setSelectedGoal(g)} onDelete={() => deleteGoal(g.id)} />)}
          </div>
        </div>
      )}

      {activeGoals.length === 0 && (
        <div className="text-center py-8">
          <Target className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No goals yet. Add a goal to start tracking progress.</p>
        </div>
      )}

      {/* Modals */}
      {showAddGoal && <GoalFormModal onClose={() => setShowAddGoal(false)} onSave={fetchData} />}
      {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}
    </div>
  );
}

// ---- Task Row ----
function TaskRow({ task, onToggle, onDelete, onClick }: { task: any; onToggle: () => void; onDelete: () => void; onClick: () => void }) {
  const subtasks = (task.subtasks as any[]) || [];
  const doneSubtasks = subtasks.filter(s => s.done).length;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl bg-card transition-all cursor-pointer hover:bg-secondary/50 ${task.status === 'done' ? 'opacity-50' : ''}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="text-muted-foreground hover:text-primary flex-shrink-0">
        {task.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0" onClick={onClick}>
        <span className={`text-sm block truncate ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
        <div className="flex items-center gap-2 mt-0.5">
          {task.aiUrgency && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${URGENCY_COLORS[task.aiUrgency] || ''}`}>{task.aiUrgency}</span>}
          {subtasks.length > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><ListChecks className="w-3 h-3" />{doneSubtasks}/{subtasks.length}</span>}
          {task.dueDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(task.dueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {task.isNeedleMover && <Zap className="w-3 h-3 text-amber-500" />}
        {task.pillar && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PILLAR_COLORS[task.pillar] }} />}
        <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ---- Goal Card ----
function GoalCard({ goal, tasks, onClick, onDelete }: { goal: any; tasks: any[]; onClick: () => void; onDelete: () => void }) {
  const PillarIcon = PILLAR_ICONS[goal.pillar] || Target;
  const goalTasks = tasks.filter((t: any) => t.goalId === goal.id);
  const doneTasks = goalTasks.filter((t: any) => t.status === 'done');
  const progress = goalTasks.length ? Math.round((doneTasks.length / goalTasks.length) * 100) : 0;
  return (
    <div onClick={onClick} className="bg-card rounded-xl p-4 cursor-pointer hover:bg-secondary/30 transition-all group" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2 mb-2">
        {goal.isProject ? <FolderKanban className="w-4 h-4" style={{ color: PILLAR_COLORS[goal.pillar] || '#6B8F71' }} /> : <PillarIcon className="w-4 h-4" style={{ color: PILLAR_COLORS[goal.pillar] || '#999' }} />}
        <span className="text-sm font-semibold flex-1 truncate">{goal.title}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">w{goal.weight}</span>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      {goal.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{goal.description}</p>}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span>{doneTasks.length}/{goalTasks.length}</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded capitalize">{goal.type}</span>
      </div>
    </div>
  );
}

// ---- Goal Detail Page ----
function GoalDetail({ goal, tasks, onBack, onTaskClick, onRefresh }: { goal: any; tasks: any[]; onBack: () => void; onTaskClick: (t: any) => void; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: goal.title, description: goal.description || '', weight: goal.weight, type: goal.type, pillar: goal.pillar || '', isProject: goal.isProject, targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '', target: goal.target?.toString() || '', unit: goal.unit || '', metricSource: goal.metricSource || '' });
  const [showAddTask, setShowAddTask] = useState(false);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const doneTasks = tasks.filter(t => t.status === 'done');
  const progress = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const PillarIcon = PILLAR_ICONS[goal.pillar] || Target;

  useEffect(() => {
    fetch(`/api/journal?goalId=${goal.id}&limit=10`).then(r => r.ok ? r.json() : []).then(setJournalEntries).catch(() => {});
  }, [goal.id]);

  const saveGoal = async () => {
    try {
      await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          targetDate: form.targetDate || null,
          target: form.target ? parseFloat(form.target) : null,
          unit: form.unit || null,
          metricSource: form.metricSource || null,
        }),
      });
      toast.success('Goal updated');
      setEditing(false);
      onRefresh();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {goal.isProject ? <FolderKanban className="w-5 h-5" style={{ color: PILLAR_COLORS[goal.pillar] || '#6B8F71' }} /> : <PillarIcon className="w-5 h-5" style={{ color: PILLAR_COLORS[goal.pillar] || '#999' }} />}
            <h1 className="text-lg font-display font-bold">{goal.title}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-medium">Weight {goal.weight}/10</span>
            <span className="text-xs px-2 py-0.5 bg-secondary rounded capitalize">{goal.type}</span>
            {goal.isProject && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">Project</span>}
          </div>
        </div>
        <button onClick={() => setEditing(!editing)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-card rounded-xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Goal title" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none" placeholder="Description..." />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Weight (1-10)</label>
              <input type="range" min="1" max="10" value={form.weight} onChange={(e) => setForm({ ...form, weight: parseInt(e.target.value) })} className="w-full accent-primary" />
              <span className="text-xs text-primary font-semibold">{form.weight}/10</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select value={form.type} onChange={(e: any) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="long-term">Long-term</option>
                <option value="mid-term">Mid-term</option>
                <option value="short-term">Short-term</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isProject} onChange={(e: any) => setForm({ ...form, isProject: e.target.checked })} className="accent-primary" />
            <FolderKanban className="w-3.5 h-3.5 text-blue-500" /> Treat as Project
          </label>
          <div className="border-t border-border pt-2 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Goal Metric</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Target" type="number" value={form.target} onChange={(e: any) => setForm({ ...form, target: e.target.value })} />
              <select value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
                <option value="">Unit</option>
                <option value="$">$</option>
                <option value="%">%</option>
                <option value="kg">kg</option>
                <option value="count">count</option>
                <option value="streak">streak</option>
              </select>
            </div>
            <select value={form.metricSource} onChange={(e: any) => setForm({ ...form, metricSource: e.target.value })} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">Progress source</option>
              <option value="transactions">Transactions</option>
              <option value="habits">Habits</option>
              <option value="life_score">Life score</option>
              <option value="tasks">Tasks</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveGoal}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Progress</span>
          {goal.target && goal.unit ? (
            <span className="text-sm font-bold text-primary">
              {goal.unit === '$' ? `$${(goal.current || 0).toLocaleString()} / $${goal.target.toLocaleString()}` : `${goal.current || 0} / ${goal.target}${goal.unit}`}
            </span>
          ) : (
            <span className="text-sm font-bold text-primary">{progress}%</span>
          )}
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${goal.target ? Math.min(((goal.current || 0) / goal.target) * 100, 100) : progress}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {goal.metricSource ? `Source: ${goal.metricSource}` : `${doneTasks.length} of ${tasks.length} tasks completed`}
        </p>
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Tasks</span>
          <Button size="sm" variant="outline" onClick={() => setShowAddTask(true)}><Plus className="w-4 h-4 mr-1" /> Task</Button>
        </div>
        {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No tasks yet.</p>}
        <div className="space-y-1.5">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} onToggle={async () => {
              const res = await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: t.status === 'done' ? 'todo' : 'done' }) });
              if (res.ok) onRefresh();
            }} onDelete={async () => {
              await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
              onRefresh();
            }} onClick={() => onTaskClick(t)} />
          ))}
        </div>
      </div>

      {/* Journal Entries linked to this goal */}
      {journalEntries.length > 0 && (
        <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Journal Entries</span>
          </div>
          <div className="space-y-2">
            {journalEntries.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground w-20">{new Date(e.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                <span className="text-xs px-1.5 py-0.5 bg-secondary rounded capitalize">{e.sessionType}</span>
                <span className="flex-1 truncate">{e.dayTitle || 'Untitled'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddTask && <SharedTaskFormModal goals={[{ ...goal }]} defaultGoalId={goal.id} onClose={() => setShowAddTask(false)} onSave={onRefresh} />}
    </div>
  );
}

// ---- Goal Form Modal ----
function GoalFormModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', type: 'short-term', pillar: '', weight: 5, isProject: false, targetDate: '', target: '', unit: '', metricSource: '' });
  const submit = async () => {
    if (!form.title.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          targetDate: form.targetDate || null,
          target: form.target ? parseFloat(form.target) : null,
          unit: form.unit || null,
          metricSource: form.metricSource || null,
        }),
      });
      if (res.ok) { toast.success('Goal added'); onClose(); onSave(); }
    } catch { toast.error('Failed'); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold">New Goal</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <Input placeholder="Goal title" value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="Description (optional)" />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Importance: {form.weight}/10</label>
            <input type="range" min="1" max="10" value={form.weight} onChange={(e) => setForm({ ...form, weight: parseInt(e.target.value) })} className="w-full accent-primary" />
          </div>
          <select value={form.type} onChange={(e: any) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="long-term">Long-term</option>
            <option value="mid-term">Mid-term</option>
            <option value="short-term">Short-term</option>
          </select>
          <select value={form.pillar} onChange={(e: any) => setForm({ ...form, pillar: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">No pillar</option>
            <option value="wealth">Wealth</option>
            <option value="health">Health</option>
            <option value="relationship">Relationship</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isProject} onChange={(e: any) => setForm({ ...form, isProject: e.target.checked })} className="accent-primary" />
            <FolderKanban className="w-3.5 h-3.5 text-blue-500" /> This is a Project
          </label>
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Goal Metric (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Target value" type="number" value={form.target} onChange={(e: any) => setForm({ ...form, target: e.target.value })} />
              <select value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
                <option value="">Unit</option>
                <option value="$">$ (dollars)</option>
                <option value="%">% (percent)</option>
                <option value="kg">kg</option>
                <option value="count">count</option>
                <option value="streak">streak</option>
              </select>
            </div>
            <select value={form.metricSource} onChange={(e: any) => setForm({ ...form, metricSource: e.target.value })} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">Progress source</option>
              <option value="transactions">Transactions (income/expense)</option>
              <option value="habits">Habit completions</option>
              <option value="life_score">Life score metric</option>
              <option value="tasks">Task completion count</option>
              <option value="manual">Manual updates</option>
            </select>
          </div>
          <Button onClick={submit} className="w-full">Add Goal</Button>
        </div>
      </div>
    </div>
  );
}

// ---- AI Settings Modal ----
function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<any>({
    taskRules: [],
    emailRules: [],
    replyTone: '',
    priorities: [],
  });
  const [newTaskRule, setNewTaskRule] = useState('');
  const [newEmailRule, setNewEmailRule] = useState('');
  const [newPriority, setNewPriority] = useState('');

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (p.aiPreferences) setPrefs({ taskRules: [], emailRules: [], replyTone: '', priorities: [], ...p.aiPreferences });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiPreferences: prefs }),
      });
      toast.success('AI preferences saved');
      onClose();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const addRule = (type: 'taskRules' | 'emailRules' | 'priorities', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setPrefs((p: any) => ({ ...p, [type]: [...(p[type] || []), value.trim()] }));
    setter('');
  };

  const removeRule = (type: string, idx: number) => {
    setPrefs((p: any) => ({ ...p, [type]: p[type].filter((_: any, i: number) => i !== idx) }));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold">AI Preferences</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">These rules are injected into AI prompts for task prioritization and email zeroing. The AI will follow them.</p>

            {/* Task Prioritization Rules */}
            <div>
              <label className="text-sm font-semibold mb-2 block">Task Prioritization Rules</label>
              <p className="text-xs text-muted-foreground mb-2">e.g. "Always prioritize revenue-generating tasks" or "Health tasks every morning"</p>
              {prefs.taskRules?.map((r: string, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm flex-1 bg-secondary/50 px-3 py-1.5 rounded-lg">{r}</span>
                  <button onClick={() => removeRule('taskRules', i)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <Input placeholder="Add rule..." value={newTaskRule} onChange={(e: any) => setNewTaskRule(e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') addRule('taskRules', newTaskRule, setNewTaskRule); }} className="h-8 text-sm" />
                <Button size="sm" variant="outline" onClick={() => addRule('taskRules', newTaskRule, setNewTaskRule)} className="h-8"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Email Rules */}
            <div>
              <label className="text-sm font-semibold mb-2 block">Email Handling Rules</label>
              <p className="text-xs text-muted-foreground mb-2">e.g. "Always archive emails from notifications@" or "Never delete from Joel"</p>
              {prefs.emailRules?.map((r: string, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm flex-1 bg-secondary/50 px-3 py-1.5 rounded-lg">{r}</span>
                  <button onClick={() => removeRule('emailRules', i)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <Input placeholder="Add rule..." value={newEmailRule} onChange={(e: any) => setNewEmailRule(e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') addRule('emailRules', newEmailRule, setNewEmailRule); }} className="h-8 text-sm" />
                <Button size="sm" variant="outline" onClick={() => addRule('emailRules', newEmailRule, setNewEmailRule)} className="h-8"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Reply Tone */}
            <div>
              <label className="text-sm font-semibold mb-2 block">Reply Tone</label>
              <select value={prefs.replyTone} onChange={(e: any) => setPrefs({ ...prefs, replyTone: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">Default (professional)</option>
                <option value="casual">Casual & friendly</option>
                <option value="professional">Professional & formal</option>
                <option value="concise">Concise & direct</option>
                <option value="warm">Warm & empathetic</option>
              </select>
            </div>

            {/* Auto Calendar */}
            <div className="flex items-center justify-between bg-primary/5 rounded-lg p-3 border border-primary/10">
              <div>
                <label className="text-sm font-semibold block">Auto-Schedule to Calendar</label>
                <p className="text-xs text-muted-foreground">When AI prioritizes, it plots tasks on your calendar and reschedules missed ones.</p>
              </div>
              <button onClick={() => setPrefs((p: any) => ({ ...p, autoCalendar: !p.autoCalendar }))} className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${prefs.autoCalendar ? 'bg-primary' : 'bg-secondary'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${prefs.autoCalendar ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Current Priorities */}
            <div>
              <label className="text-sm font-semibold mb-2 block">Current Life Priorities</label>
              <p className="text-xs text-muted-foreground mb-2">What matters most right now? AI uses this for all decisions.</p>
              {prefs.priorities?.map((p: string, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm flex-1 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10">{p}</span>
                  <button onClick={() => removeRule('priorities', i)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <Input placeholder="e.g. Launch MVP by March" value={newPriority} onChange={(e: any) => setNewPriority(e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') addRule('priorities', newPriority, setNewPriority); }} className="h-8 text-sm" />
                <Button size="sm" variant="outline" onClick={() => addRule('priorities', newPriority, setNewPriority)} className="h-8"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save Preferences
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}