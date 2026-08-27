'use client';
import { useState, useMemo } from 'react';
import { X, Plus, Search, GripVertical, Trash2, ChevronLeft, Check, Minus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MUSCLE_EMOJI: Record<string, string> = {
  chest: '💪', back: '🪴', legs: '🦵', shoulders: '🏋️',
  arms: '💪', core: '🫨', cardio: '❤️', full_body: '🔥',
};

interface TemplateExercise {
  exerciseId: string;
  exerciseName: string;
  muscleGroup?: string;
  sets: number;
  reps?: number;
  weight?: number;
  restSeconds?: number;
  supersetGroup?: number | null;
}

interface TemplateEditorProps {
  exercises: any[];
  initialData?: {
    id?: string;
    name: string;
    description?: string;
    exercises: TemplateExercise[];
  };
  onSave: (data: { name: string; description: string; exercises: TemplateExercise[]; id?: string }) => Promise<void>;
  onCancel: () => void;
}

export function TemplateEditor({ exercises: allExercises, initialData, onSave, onCancel }: TemplateEditorProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [templateExercises, setTemplateExercises] = useState<TemplateExercise[]>(
    initialData?.exercises || []
  );
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [nextSupersetGroup, setNextSupersetGroup] = useState(1);

  const filtered = useMemo(() => {
    if (!search) return allExercises.slice(0, 30);
    return allExercises.filter(e =>
      e.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 20);
  }, [allExercises, search]);

  const addExercise = (ex: any) => {
    setTemplateExercises(prev => [...prev, {
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: 3,
      reps: ex.category === 'cardio' ? undefined : 8,
      weight: undefined,
      restSeconds: 90,
      supersetGroup: null,
    }]);
    setShowPicker(false);
    setSearch('');
  };

  const removeExercise = (index: number) => {
    setTemplateExercises(prev => prev.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: string, value: any) => {
    setTemplateExercises(prev => prev.map((ex, i) =>
      i === index ? { ...ex, [field]: value } : ex
    ));
  };

  const moveExercise = (from: number, direction: 'up' | 'down') => {
    const to = direction === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= templateExercises.length) return;
    setTemplateExercises(prev => {
      const arr = [...prev];
      [arr[from], arr[to]] = [arr[to], arr[from]];
      return arr;
    });
  };

  const toggleSuperset = (index: number) => {
    const ex = templateExercises[index];
    if (ex.supersetGroup) {
      // Remove from superset
      updateExercise(index, 'supersetGroup', null);
    } else if (index > 0) {
      // Join previous exercise's superset or create new one
      const prev = templateExercises[index - 1];
      if (prev.supersetGroup) {
        updateExercise(index, 'supersetGroup', prev.supersetGroup);
      } else {
        const group = nextSupersetGroup;
        setNextSupersetGroup(g => g + 1);
        updateExercise(index - 1, 'supersetGroup', group);
        updateExercise(index, 'supersetGroup', group);
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (templateExercises.length === 0) { toast.error('Add at least one exercise'); return; }
    setSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        name: name.trim(),
        description: description.trim(),
        exercises: templateExercises,
      });
    } finally { setSaving(false); }
  };

  // Superset colors
  const SUPERSET_COLORS = ['border-l-sky-400', 'border-l-purple-400', 'border-l-orange-400', 'border-l-pink-400', 'border-l-emerald-400'];

  return (
    <div className="space-y-3">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="w-4 h-4" />Back
      </button>

      <div className="game-card p-4">
        <h2 className="font-display font-bold text-sm mb-3">{initialData?.id ? 'Edit Template' : 'Create Template'}</h2>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Push Day A" className="text-sm h-9 mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Description (optional)</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Chest, shoulders, triceps" className="text-sm h-9 mt-0.5" />
          </div>
        </div>
      </div>

      {/* Exercise list */}
      <div className="space-y-1.5">
        {templateExercises.map((ex, i) => {
          const ssColor = ex.supersetGroup
            ? SUPERSET_COLORS[(ex.supersetGroup - 1) % SUPERSET_COLORS.length]
            : '';
          const prevInSS = i > 0 && templateExercises[i - 1].supersetGroup === ex.supersetGroup && ex.supersetGroup;

          return (
            <div key={`${ex.exerciseId}-${i}`}
              className={`game-card p-3 border-l-4 ${ssColor || 'border-l-transparent'} ${prevInSS ? '-mt-0.5' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveExercise(i, 'up')} className="text-muted-foreground hover:text-foreground" disabled={i === 0}>
                    <GripVertical className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-sm">{MUSCLE_EMOJI[ex.muscleGroup || ''] || '🏋️'}</span>
                <span className="text-[13px] font-bold flex-1 truncate">{ex.exerciseName}</span>
                {i > 0 && (
                  <button
                    onClick={() => toggleSuperset(i)}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                      ex.supersetGroup
                        ? 'bg-sky-100 dark:bg-sky-950/30 text-sky-600 border-sky-300 dark:border-sky-700'
                        : 'text-muted-foreground border-border hover:border-primary'
                    }`}
                    title={ex.supersetGroup ? 'Remove from superset' : 'Link as superset with exercise above'}
                  >
                    SS
                  </button>
                )}
                <button onClick={() => removeExercise(i)} className="text-muted-foreground hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sets/Reps/Rest config */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[8px] font-mono text-muted-foreground uppercase">Sets</label>
                  <div className="flex items-center gap-1 mt-0.5">
                    <button onClick={() => updateExercise(i, 'sets', Math.max(1, ex.sets - 1))} className="w-6 h-6 rounded bg-secondary flex items-center justify-center">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-mono font-bold w-6 text-center">{ex.sets}</span>
                    <button onClick={() => updateExercise(i, 'sets', Math.min(10, ex.sets + 1))} className="w-6 h-6 rounded bg-secondary flex items-center justify-center">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[8px] font-mono text-muted-foreground uppercase">Reps</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={ex.reps ?? ''}
                    onChange={e => updateExercise(i, 'reps', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full mt-0.5 bg-secondary/50 rounded px-2 py-1 text-sm font-mono text-center focus:ring-1 focus:ring-primary/30 outline-none"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-mono text-muted-foreground uppercase">Rest (s)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={ex.restSeconds ?? ''}
                    onChange={e => updateExercise(i, 'restSeconds', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full mt-0.5 bg-secondary/50 rounded px-2 py-1 text-sm font-mono text-center focus:ring-1 focus:ring-primary/30 outline-none"
                    placeholder="90"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add exercise button / picker */}
      {showPicker ? (
        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-bold text-sm">Add Exercise</h3>
            <button onClick={() => { setShowPicker(false); setSearch(''); }}><X className="w-4 h-4" /></button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercises..." className="pl-9 text-sm h-8" autoFocus />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filtered.map((ex: any) => (
              <button key={ex.id}
                onClick={() => addExercise(ex)}
                className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-secondary/30 text-left"
              >
                <span className="text-sm">{MUSCLE_EMOJI[ex.muscleGroup] || '🏋️'}</span>
                <span className="text-[12px] font-semibold flex-1">{ex.name}</span>
                <span className="text-[9px] text-muted-foreground capitalize">{ex.equipment || 'bw'}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="game-card p-3 w-full text-center text-sm text-primary hover:shadow-md transition-all flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" />Add Exercise
        </button>
      )}

      {/* Save button */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Saving...' : <><Check className="w-3.5 h-3.5 mr-1" />{initialData?.id ? 'Update' : 'Create'} Template</>}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
