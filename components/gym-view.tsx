'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dumbbell, Search, Plus, Play, Clock, Trophy, ChevronDown, ChevronRight,
  Loader2, X, Check, Trash2, RefreshCw, Sparkles,
  Timer, Flame, Target, ChevronLeft, RotateCcw, Zap, BookOpen,
  Copy, ArrowLeftRight, Edit3, Link2, Unlink, StickyNote, Save, MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RestTimer } from '@/components/gym/rest-timer';
import { TemplateEditor } from '@/components/gym/template-editor';
import { ExerciseThumbnail } from '@/components/gym/muscle-diagram';

const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'] as const;
const MUSCLE_EMOJI: Record<string, string> = {
  chest: '💪', back: '🪴', legs: '🦵', shoulders: '🏋️',
  arms: '💪', core: '🫨', cardio: '❤️', full_body: '🔥',
};
const EQUIPMENT_LIST = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'band'] as const;

type SubView = 'home' | 'library' | 'session' | 'history' | 'templates' | 'exercise_detail';

export function GymView() {
  const [subView, setSubView] = useState<SubView>('home');
  const [exercises, setExercises] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active session state
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionSets, setSessionSets] = useState<any[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  // Rest timer
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  // Per-exercise auto-rest config (seconds; 0/undefined = off). Persisted per-device.
  const [restConfig, setRestConfig] = useState<Record<string, number>>({});
  const [restTarget, setRestTarget] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  // Per-exercise tracking-mode override ('time' | 'reps'); falls back to auto-detect.
  const [trackMode, setTrackMode] = useState<Record<string, 'time' | 'reps'>>({});
  // Update-template prompt shown after finishing a template-based session that changed.
  const [templatePrompt, setTemplatePrompt] = useState<null | { templateId: string; newExercises: any[]; changedSets: number }>(null);

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<any>(null); // null = not editing, {} = new, {id:...} = editing

  // Superset grouping in session
  const [nextSSGroup, setNextSSGroup] = useState(1);

  // Switch-exercise picker (active session)
  const [switchTarget, setSwitchTarget] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [switchMuscle, setSwitchMuscle] = useState<string | null>(null);
  const [switchSearch, setSwitchSearch] = useState('');

  // Per-exercise notes in the active session (persist via ExerciseNote API)
  const [sessionNotes, setSessionNotes] = useState<Record<string, string>>({});
  const [noteTarget, setNoteTarget] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingSessionNote, setSavingSessionNote] = useState(false);
  const notesFetchedRef = useRef<Set<string>>(new Set());

  // Previous session data for "Previous" column
  const [previousData, setPreviousData] = useState<Record<string, {weight: number; reps: number; duration?: number}[]>>({});

  // Exercise detail
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'about' | 'history' | 'records'>('about');
  const [exerciseNote, setExerciseNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);

  // Open an exercise's detail view and load its per-user remark
  const openExerciseDetail = useCallback(async (ex: any) => {
    setSelectedExercise(ex);
    setDetailTab('about');
    setSubView('exercise_detail');
    setExerciseNote(''); setNoteDraft('');
    try {
      const r = await fetch(`/api/gym/exercises/${ex.id}/notes`);
      if (r.ok) { const d = await r.json(); setExerciseNote(d.note || ''); setNoteDraft(d.note || ''); }
    } catch {}
  }, []);

  const saveExerciseNote = async () => {
    if (!selectedExercise) return;
    setSavingNote(true);
    try {
      const r = await fetch(`/api/gym/exercises/${selectedExercise.id}/notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft }),
      });
      if (r.ok) { const d = await r.json(); setExerciseNote(d.note || ''); setNoteDraft(d.note || ''); toast.success('Note saved'); }
      else toast.error('Failed to save note');
    } catch { toast.error('Failed to save note'); }
    finally { setSavingNote(false); }
  };

  const generateGuide = async () => {
    if (!selectedExercise) return;
    setGeneratingGuide(true);
    try {
      const r = await fetch(`/api/gym/exercises/${selectedExercise.id}/guide`, { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        const updated = { ...selectedExercise, guide: d.guide, formCues: d.formCues };
        setSelectedExercise(updated);
        setExercises(prev => prev.map(e => e.id === updated.id ? { ...e, guide: d.guide, formCues: d.formCues } : e));
        toast.success('Guide generated');
      } else { const e = await r.json().catch(() => ({})); toast.error(e.error || 'Failed to generate guide'); }
    } catch { toast.error('Failed to generate guide'); }
    finally { setGeneratingGuide(false); }
  };

  // Library filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<string | null>(null);
  const [filterEquipment, setFilterEquipment] = useState<string | null>(null);

  // Template creation
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [exRes, tplRes, sessRes, recRes] = await Promise.all([
        fetch('/api/gym/exercises'),
        fetch('/api/gym/templates'),
        fetch('/api/gym/workouts?limit=10'),
        fetch('/api/gym/records'),
      ]);
      if (exRes.ok) setExercises(await exRes.json());
      if (tplRes.ok) setTemplates(await tplRes.json());
      if (sessRes.ok) setSessions(await sessRes.json());
      if (recRes.ok) setRecords(await recRes.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listen for Jarvis FAB events
  useEffect(() => {
    const onStartSession = (e: Event) => {
      const { name, exercises } = (e as CustomEvent).detail;
      startSession(name, exercises);
    };
    const onSaveTemplate = (e: Event) => {
      const { name, exercises, description } = (e as CustomEvent).detail;
      saveAsTemplate(name, exercises, description);
    };
    window.addEventListener('jarvis:startGymSession', onStartSession);
    window.addEventListener('jarvis:saveGymTemplate', onSaveTemplate);
    return () => {
      window.removeEventListener('jarvis:startGymSession', onStartSession);
      window.removeEventListener('jarvis:saveGymTemplate', onSaveTemplate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  // Load previous session data for exercise comparison
  const loadPreviousData = useCallback((exerciseIds: string[]) => {
    const prevMap: Record<string, {weight: number; reps: number; duration?: number}[]> = {};
    for (const exId of exerciseIds) {
      // Find last session that included this exercise
      for (const s of sessions) {
        const exSets = s.sets?.filter((set: any) => set.exerciseId === exId && !set.isWarmup);
        if (exSets?.length > 0) {
          prevMap[exId] = exSets.map((set: any) => ({ weight: set.weight || 0, reps: set.reps || 0, duration: set.duration || undefined }));
          break;
        }
      }
    }
    setPreviousData(prevMap);
  }, [sessions]);

  // Load per-device gym prefs (auto-rest durations + tracking-mode overrides)
  useEffect(() => {
    try { const r = JSON.parse(localStorage.getItem('gym_rest_config') || '{}'); if (r && typeof r === 'object') setRestConfig(r); } catch {}
    try { const t = JSON.parse(localStorage.getItem('gym_track_mode') || '{}'); if (t && typeof t === 'object') setTrackMode(t); } catch {}
  }, []);

  // === START SESSION FROM TEMPLATE/SUGGESTION ===
  const startSession = (name: string, exerciseList: any[], templateId?: string) => {
    setActiveSession({ name, templateId });
    setSessionStartTime(new Date());
    setNextSSGroup(1);
    // Initialize sets from exercise list
    const initialSets: any[] = [];
    let currentSSGroup = 0;
    for (const ex of exerciseList) {
      const numSets = ex.sets || 3;
      if (ex.supersetGroup) currentSSGroup = ex.supersetGroup;
      for (let i = 0; i < numSets; i++) {
        initialSets.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          setNumber: i + 1,
          weight: ex.weight || null,
          reps: ex.reps || null,
          duration: ex.duration || null,
          restSeconds: ex.restSeconds || 90,
          isWarmup: false,
          isDropSet: false,
          completed: false,
          rpe: null,
          supersetGroup: ex.supersetGroup || null,
        });
      }
    }
    setSessionSets(initialSets);
    loadPreviousData(exerciseList.map(e => e.exerciseId));
    setSubView('session');
  };

  // === SAVE SESSION ===
  const saveSession = async () => {
    if (!activeSession || !sessionStartTime) return;
    const completedSets = sessionSets.filter(s => s.completed);
    if (completedSets.length === 0) {
      toast.error('Complete at least one set');
      return;
    }

    try {
      const endTime = new Date();
      const durationMins = Math.round((endTime.getTime() - sessionStartTime.getTime()) / 60000);

      const r = await fetch('/api/gym/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeSession.name,
          templateId: activeSession.templateId || null,
          startedAt: sessionStartTime.toISOString(),
          completedAt: endTime.toISOString(),
          durationMins,
          sets: completedSets.map(s => ({
            exerciseId: s.exerciseId,
            setNumber: s.setNumber,
            weight: s.weight,
            reps: s.reps,
            duration: s.duration,
            isWarmup: s.isWarmup,
            isDropSet: s.isDropSet,
            rpe: s.rpe,
          })),
        }),
      });

      if (r.ok) {
        toast.success(`Workout saved! ${durationMins}min, ${completedSets.length} sets`);
        fetchData();
        // If this came from a template and values/exercises changed, offer to update it
        if (activeSession.templateId) {
          const tmpl = templates.find((t: any) => t.id === activeSession.templateId);
          const newExercises = tmpl ? buildTemplateExercises(tmpl, completedSets) : [];
          if (tmpl && templateDiffers(tmpl, newExercises)) {
            setTemplatePrompt({ templateId: activeSession.templateId, newExercises, changedSets: completedSets.length });
            return;
          }
        }
        resetSession();
      }
    } catch { toast.error('Failed to save'); }
  };

  // === SAVE AS TEMPLATE ===
  const saveAsTemplate = async (name: string, exerciseList: any[], description?: string) => {
    try {
      const r = await fetch('/api/gym/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, exercises: exerciseList }),
      });
      if (r.ok) {
        toast.success('Template saved');
        fetchData();
      }
    } catch { toast.error('Failed to save'); }
  };

  // === SUGGEST ALTERNATIVE ===
  const suggestAlternative = async (exerciseId: string, setIndex: number) => {
    try {
      const r = await fetch('/api/gym/suggest-alternative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, reason: 'equipment_unavailable' }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.alternatives?.length > 0) {
          const alt = data.alternatives[0];
          // Replace all sets of this exercise with the alternative
          setSessionSets(prev => prev.map(s =>
            s.exerciseId === exerciseId
              ? { ...s, exerciseId: alt.id, exerciseName: alt.name }
              : s
          ));
          toast.success(`Swapped to ${alt.name}`);
        } else {
          toast.error('No alternatives found');
        }
      }
    } catch { toast.error('Error finding alternative'); }
  };

  // === SWITCH EXERCISE (manual pick) ===
  const switchExercise = (fromId: string, to: any) => {
    setSessionSets(prev => prev.map(s =>
      s.exerciseId === fromId ? { ...s, exerciseId: to.id, exerciseName: to.name } : s
    ));
    // Load previous data for the new exercise, merged (don't wipe other exercises)
    let prevSets: { weight: number; reps: number }[] = [];
    for (const sess of sessions) {
      const exSets = sess.sets?.filter((set: any) => set.exerciseId === to.id && !set.isWarmup);
      if (exSets?.length > 0) {
        prevSets = exSets.map((set: any) => ({ weight: set.weight || 0, reps: set.reps || 0 }));
        break;
      }
    }
    setPreviousData(prev => ({ ...prev, [to.id]: prevSets }));
    setSwitchTarget(null); setSwitchSearch(''); setSwitchMuscle(null);
    toast.success(`Switched to ${to.name}`);
  };

  // === ADD WARM-UP SET ===
  const addWarmupSet = (exerciseId: string) => {
    setSessionSets(prev => {
      const idx = prev.findIndex(s => s.exerciseId === exerciseId);
      if (idx === -1) return prev;
      const base = prev[idx];
      const warm = { ...base, setNumber: 0, isWarmup: true, isDropSet: false, completed: false, weight: null, reps: null };
      return [...prev.slice(0, idx), warm, ...prev.slice(idx)];
    });
    toast.success('Warm-up set added');
  };

  // === REMOVE EXERCISE FROM SESSION ===
  const removeExerciseFromSession = (exerciseId: string, name: string) => {
    setSessionSets(prev => prev.filter(s => s.exerciseId !== exerciseId));
    toast.success(`Removed ${name}`);
  };

  // === PER-EXERCISE NOTES (active session) ===
  const openNoteEditor = (exerciseId: string, exerciseName: string) => {
    setNoteTarget({ exerciseId, exerciseName });
    setNoteText(sessionNotes[exerciseId] || '');
  };

  const saveSessionNote = async () => {
    if (!noteTarget) return;
    setSavingSessionNote(true);
    try {
      const r = await fetch(`/api/gym/exercises/${noteTarget.exerciseId}/notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText }),
      });
      if (r.ok) {
        const d = await r.json();
        setSessionNotes(prev => ({ ...prev, [noteTarget.exerciseId]: d.note || '' }));
        toast.success(noteText.trim() ? 'Note saved' : 'Note cleared');
        setNoteTarget(null);
      } else toast.error('Failed to save note');
    } catch { toast.error('Failed to save note'); }
    finally { setSavingSessionNote(false); }
  };

  // Load saved notes for exercises in the active session (once per exercise)
  useEffect(() => {
    if (subView !== 'session') return;
    const ids = Array.from(new Set(sessionSets.map(s => s.exerciseId)));
    ids.forEach(async (id) => {
      if (notesFetchedRef.current.has(id)) return;
      notesFetchedRef.current.add(id);
      try {
        const r = await fetch(`/api/gym/exercises/${id}/notes`);
        if (r.ok) { const d = await r.json(); setSessionNotes(prev => ({ ...prev, [id]: d.note || '' })); }
      } catch { /* silent */ }
    });
  }, [subView, sessionSets]);

  // === DELETE A SET (renumbers remaining work sets of that exercise) ===
  const deleteSet = (globalIdx: number) => {
    setSessionSets(prev => {
      const target = prev[globalIdx];
      if (!target) return prev;
      const next = prev.filter((_, i) => i !== globalIdx);
      let n = 0;
      return next.map(s => s.exerciseId === target.exerciseId
        ? (s.isWarmup ? s : { ...s, setNumber: ++n })
        : s);
    });
    toast.success('Set deleted');
  };

  // === PER-EXERCISE AUTO-REST CONFIG (persisted per-device) ===
  const setRestForExercise = (exerciseId: string, seconds: number) => {
    setRestConfig(prev => {
      const n = { ...prev, [exerciseId]: seconds };
      try { localStorage.setItem('gym_rest_config', JSON.stringify(n)); } catch {}
      return n;
    });
    setRestTarget(null);
    toast.success(seconds > 0 ? `Auto-rest set to ${fmtTime(seconds)}` : 'Auto-rest turned off');
  };

  // === TIMED vs REP tracking ===
  const TIMED_RE = /plank|hold|hang|wall\s?-?\s?sit|l-?sit|hollow|superman|dead\s?hang|iso(?:metric)?|bridge/i;
  const isTimedExercise = (exerciseId: string, exerciseName: string) => {
    const m = trackMode[exerciseId];
    if (m) return m === 'time';
    const ex = exercises.find(e => e.id === exerciseId);
    if (ex?.trackingType) return ex.trackingType === 'time';
    return TIMED_RE.test(exerciseName) || ex?.muscleGroup === 'cardio';
  };
  const toggleTrackMode = (exerciseId: string, exerciseName: string) => {
    const nextMode: 'time' | 'reps' = isTimedExercise(exerciseId, exerciseName) ? 'reps' : 'time';
    setTrackMode(prev => {
      const n = { ...prev, [exerciseId]: nextMode };
      try { localStorage.setItem('gym_track_mode', JSON.stringify(n)); } catch {}
      return n;
    });
    toast.success(nextMode === 'time' ? 'Now tracking by time' : 'Now tracking by reps');
  };

  const fmtTime = (sec?: number | null) => {
    if (sec === null || sec === undefined) return '';
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };
  const parseTime = (str: string): number | null => {
    if (!str) return null;
    const t = str.trim();
    if (t.includes(':')) {
      const [m, s] = t.split(':');
      return (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
    }
    const n = parseInt(t);
    return isNaN(n) ? null : n;
  };

  // === BUILD/COMPARE TEMPLATE from a finished session (for the update-template prompt) ===
    // Values performed this session, keyed by exerciseId (work sets only)
  const sessionValuesByExercise = (completedSets: any[]) => {
    const byEx: Record<string, any[]> = {};
    for (const s of completedSets) {
      if (!byEx[s.exerciseId]) byEx[s.exerciseId] = [];
      byEx[s.exerciseId].push(s);
    }
    const out: Record<string, any> = {};
    for (const exId of Object.keys(byEx)) {
      const all = byEx[exId];
      const work = all.filter(s => !s.isWarmup);
      const last = work[work.length - 1] || all[all.length - 1];
      out[exId] = {
        sets: work.length || all.length,
        reps: last?.reps ?? null,
        weight: last?.weight ?? null,
        duration: last?.duration ?? null,
      };
    }
    return out;
  };
  // Merge today's values onto the ORIGINAL template, preserving every template
  // exercise (even ones not performed) and appending any brand-new ones done today.
  const buildTemplateExercises = (tmpl: any, completedSets: any[]) => {
    let orig: any[] = [];
    try { orig = Array.isArray(tmpl?.exercises) ? tmpl.exercises : JSON.parse(tmpl?.exercises || '[]'); } catch { orig = []; }
    const vals = sessionValuesByExercise(completedSets);
    const seen = new Set<string>();
    const merged = orig.map((ex: any) => {
      seen.add(ex.exerciseId);
      const v = vals[ex.exerciseId];
      if (!v) return ex; // not performed today -> keep template values untouched
      return {
        ...ex,
        sets: v.sets,
        reps: v.reps,
        weight: v.weight,
        duration: v.duration,
        restSeconds: restConfig[ex.exerciseId] ?? ex.restSeconds ?? 90,
      };
    });
    // Append exercises performed today that were not part of the template
    for (const s of completedSets) {
      if (seen.has(s.exerciseId)) continue;
      seen.add(s.exerciseId);
      const v = vals[s.exerciseId];
      merged.push({
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        sets: v?.sets ?? 1,
        reps: v?.reps ?? null,
        weight: v?.weight ?? null,
        duration: v?.duration ?? null,
        restSeconds: restConfig[s.exerciseId] || 90,
      });
    }
    return merged;
  };
  const templateDiffers = (tmpl: any, newExercises: any[]) => {
    let cur: any[] = [];
    try { cur = Array.isArray(tmpl.exercises) ? tmpl.exercises : JSON.parse(tmpl.exercises || '[]'); } catch { cur = []; }
    if (cur.length !== newExercises.length) return true;
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = newExercises[i];
      if (a.exerciseId !== b.exerciseId) return true;
      if ((a.sets || 0) !== (b.sets || 0)) return true;
      if ((a.reps ?? null) !== (b.reps ?? null)) return true;
      if ((a.weight ?? null) !== (b.weight ?? null)) return true;
      if ((a.duration ?? null) !== (b.duration ?? null)) return true;
    }
    return false;
  };
  const resetSession = () => {
    setActiveSession(null); setSessionSets([]); setSessionStartTime(null); setTemplatePrompt(null); setSubView('home');
  };
  const updateTemplateValues = async () => {
    if (!templatePrompt) return;
    try {
      await fetch(`/api/gym/templates/${templatePrompt.templateId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: templatePrompt.newExercises }),
      });
      toast.success('Template updated');
    } catch { toast.error('Could not update template'); }
    fetchData();
    resetSession();
  };

  // === DELETE TEMPLATE ===
  const deleteTemplate = async (id: string) => {
    try {
      const r = await fetch(`/api/gym/templates/${id}`, { method: 'DELETE' });
      if (r.ok) { toast.success('Deleted'); fetchData(); }
    } catch { toast.error('Failed'); }
  };

  // Filtered exercises for library
  const filteredExercises = useMemo(() => {
    return exercises.filter(e => {
      if (filterMuscle && e.muscleGroup !== filterMuscle) return false;
      if (filterEquipment && e.equipment !== filterEquipment) return false;
      if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [exercises, filterMuscle, filterEquipment, searchQuery]);

  // Group exercises by muscle
  const groupedExercises = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const e of filteredExercises) {
      if (!groups[e.muscleGroup]) groups[e.muscleGroup] = [];
      groups[e.muscleGroup].push(e);
    }
    return groups;
  }, [filteredExercises]);

  // PRs grouped by exercise
  const volumeHistory = useMemo(() => {
    if (!selectedExercise) return [];
    const recent = sessions.filter((s: any) =>
      s.sets?.some((set: any) => set.exerciseId === selectedExercise.id)
    );
    return recent.slice(0, 10).reverse().map((s: any) => {
      const exSets = s.sets.filter((set: any) => set.exerciseId === selectedExercise.id && set.completed !== false);
      const totalVol = exSets.reduce((sum: number, set: any) => sum + ((set.weight || 0) * (set.reps || 0)), 0);
      const maxWeight = Math.max(0, ...exSets.map((set: any) => set.weight || 0));
      return {
        date: new Date(s.startedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }),
        volume: totalVol,
        maxWeight,
        sets: exSets.length,
      };
    });
  }, [sessions, selectedExercise]);

  const prsByExercise = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of records) {
      if (!map[r.exerciseId]) map[r.exerciseId] = [];
      map[r.exerciseId].push(r);
    }
    return map;
  }, [records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // === RENDER: ACTIVE SESSION ===
  if (subView === 'session' && activeSession) {
    // Group session sets by exercise
    const exerciseGroups: { exerciseId: string; exerciseName: string; sets: any[]; supersetGroup?: number | null }[] = [];
    const seen = new Set<string>();
    for (const s of sessionSets) {
      if (!seen.has(s.exerciseId)) {
        seen.add(s.exerciseId);
        exerciseGroups.push({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName,
          sets: sessionSets.filter(ss => ss.exerciseId === s.exerciseId),
          supersetGroup: s.supersetGroup,
        });
      }
    }

    const completedCount = sessionSets.filter(s => s.completed).length;
    const elapsed = sessionStartTime
      ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
      : 0;

    const SUPERSET_COLORS = ['border-l-sky-400', 'border-l-purple-400', 'border-l-orange-400', 'border-l-pink-400', 'border-l-emerald-400'];

    const handleCompleteSet = (globalIdx: number, prev?: any) => {
      const set = sessionSets[globalIdx];
      const newCompleted = !set.completed;
      setSessionSets(list => list.map((s, i) => {
        if (i !== globalIdx) return s;
        const updated = { ...s, completed: newCompleted };
        // Smart prefill from previous when completing an empty set
        if (newCompleted && prev) {
          if (updated.weight == null && prev.weight != null) updated.weight = prev.weight;
          if (updated.reps == null && prev.reps != null) updated.reps = prev.reps;
          if (updated.duration == null && prev.duration != null) updated.duration = prev.duration;
        }
        return updated;
      }));
      // Opt-in rest timer: only when this exercise has an auto-rest configured
      if (newCompleted && !set.isWarmup) {
        const cfg = restConfig[set.exerciseId];
        if (cfg && cfg > 0) {
          setRestTimerSeconds(cfg);
          setShowRestTimer(true);
        }
      }
    };

    const toggleSessionSuperset = (exIdx: number) => {
      if (exIdx === 0) return;
      const thisGroup = exerciseGroups[exIdx];
      const prevGroup = exerciseGroups[exIdx - 1];
      if (thisGroup.supersetGroup) {
        // Unlink
        setSessionSets(prev => prev.map(s => s.exerciseId === thisGroup.exerciseId ? { ...s, supersetGroup: null } : s));
      } else {
        const group = prevGroup.supersetGroup || nextSSGroup;
        if (!prevGroup.supersetGroup) {
          setNextSSGroup(g => g + 1);
          setSessionSets(prev => prev.map(s => s.exerciseId === prevGroup.exerciseId ? { ...s, supersetGroup: group } : s));
        }
        setSessionSets(prev => prev.map(s => s.exerciseId === thisGroup.exerciseId ? { ...s, supersetGroup: group } : s));
      }
    };

    const switchList = exercises.filter((ex: any) => {
      if (switchMuscle && ex.muscleGroup !== switchMuscle) return false;
      if (switchSearch && !ex.name.toLowerCase().includes(switchSearch.toLowerCase())) return false;
      return true;
    }).slice(0, 120);

    return (
      <div className="space-y-3">
        {/* Rest Timer Modal */}
        <RestTimer isOpen={showRestTimer} onClose={() => setShowRestTimer(false)} defaultSeconds={restTimerSeconds} />

        {/* Switch Exercise picker */}
        <Dialog open={!!switchTarget} onOpenChange={(o) => { if (!o) setSwitchTarget(null); }}>
          <DialogContent className="max-w-md p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-3 border-b space-y-0.5 text-left">
              <DialogTitle className="font-display text-base">Switch Exercise</DialogTitle>
              {switchTarget && (
                <p className="text-xs text-muted-foreground">
                  Replacing <span className="font-semibold text-foreground">{switchTarget.exerciseName}</span>
                </p>
              )}
            </DialogHeader>
            <div className="px-4 py-3 space-y-2 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={switchSearch}
                  onChange={e => setSwitchSearch(e.target.value)}
                  placeholder="Search exercises..."
                  className="pl-9 text-sm h-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSwitchMuscle(null)}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                    !switchMuscle ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >All</button>
                {MUSCLE_GROUPS.map(mg => (
                  <button key={mg}
                    onClick={() => setSwitchMuscle(switchMuscle === mg ? null : mg)}
                    className={`text-[10px] px-2 py-1 rounded-full transition-colors capitalize ${
                      switchMuscle === mg ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
                    }`}
                  >{MUSCLE_EMOJI[mg]} {mg.replace('_', ' ')}</button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
              {switchList.map((ex: any) => {
                const isCurrent = ex.id === switchTarget?.exerciseId;
                return (
                  <button key={ex.id}
                    disabled={isCurrent}
                    onClick={() => switchTarget && switchExercise(switchTarget.exerciseId, ex)}
                    className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-secondary/40 text-left disabled:opacity-40 disabled:cursor-default"
                  >
                    <ExerciseThumbnail exercise={ex} size="sm" />
                    <span className="text-[13px] font-semibold flex-1">{ex.name}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">{ex.equipment || 'bodyweight'}</span>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                );
              })}
              {switchList.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">No exercises found</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Exercise Note editor */}
        <Dialog open={!!noteTarget} onOpenChange={(o) => { if (!o) setNoteTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader className="text-left space-y-0.5">
              <DialogTitle className="font-display text-base">Exercise Note</DialogTitle>
              {noteTarget && <p className="text-xs text-muted-foreground">{noteTarget.exerciseName}</p>}
            </DialogHeader>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Add a note for this exercise (form cues, setup, reminders, machine seat height...)"
              className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Saved to this exercise &middot; visible next time too</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setNoteTarget(null)}>Cancel</Button>
                <Button size="sm" onClick={saveSessionNote} disabled={savingSessionNote}>
                  {savingSessionNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1" />Save</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rest Timer picker */}
        <Dialog open={!!restTarget} onOpenChange={(o) => { if (!o) setRestTarget(null); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader className="text-left space-y-0.5">
              <DialogTitle className="font-display text-base">Rest Timer</DialogTitle>
              {restTarget && <p className="text-xs text-muted-foreground">{restTarget.exerciseName}</p>}
            </DialogHeader>
            <p className="text-[11px] text-muted-foreground -mt-1">Auto-start a rest countdown after each working set.</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => restTarget && setRestForExercise(restTarget.exerciseId, 0)}
                className={`py-2 rounded-lg text-sm font-mono border ${restTarget && !restConfig[restTarget.exerciseId] ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/20 hover:border-primary/50'}`}
              >Off</button>
              {[30, 60, 90, 120, 180].map(sec => (
                <button key={sec}
                  onClick={() => restTarget && setRestForExercise(restTarget.exerciseId, sec)}
                  className={`py-2 rounded-lg text-sm font-mono border ${restTarget && restConfig[restTarget.exerciseId] === sec ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/20 hover:border-primary/50'}`}
                >{fmtTime(sec)}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Custom (sec):</span>
              <input
                type="number"
                inputMode="numeric"
                defaultValue={restTarget ? (restConfig[restTarget.exerciseId] || '') : ''}
                key={restTarget?.exerciseId || 'none'}
                onKeyDown={e => {
                  if (e.key === 'Enter' && restTarget) {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    setRestForExercise(restTarget.exerciseId, isNaN(v) ? 0 : v);
                  }
                }}
                onBlur={e => {
                  if (restTarget) {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setRestForExercise(restTarget.exerciseId, v);
                  }
                }}
                className="flex-1 bg-secondary/50 rounded px-2 py-1 text-sm font-mono focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder="e.g. 45"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Update Template prompt (on finish) */}
        <Dialog open={!!templatePrompt} onOpenChange={(o) => { if (!o) resetSession(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="font-display text-base">Update Template?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              You&apos;ve made changes from your original template. Would you like to update it with today&apos;s values?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={updateTemplateValues}>Update Values Only</Button>
              <Button variant="ghost" onClick={resetSession}>Keep Original Template</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Session header */}
        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display font-bold text-lg">{activeSession.name}</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{elapsed}min</span>
                <span className="flex items-center gap-1"><Check className="w-3 h-3" />{completedCount}/{sessionSets.length} sets</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRestTimer(true); setRestTimerSeconds(90); }}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/30 text-sky-600 font-semibold"
              >
                <Timer className="w-3.5 h-3.5" />Timer
              </button>
              <Button variant="ghost" size="sm" onClick={() => { setActiveSession(null); setSubView('home'); }}>Cancel</Button>
              <Button size="sm" onClick={saveSession}><Check className="w-3.5 h-3.5 mr-1" />Finish</Button>
            </div>
          </div>
        </div>

        {/* Exercise groups */}
        {exerciseGroups.map((group, gi) => {
          const exercise = exercises.find(e => e.id === group.exerciseId);
          const prevSets = previousData[group.exerciseId] || [];
          const ssColor = group.supersetGroup
            ? SUPERSET_COLORS[((group.supersetGroup || 1) - 1) % SUPERSET_COLORS.length]
            : 'border-l-transparent';
          const timed = isTimedExercise(group.exerciseId, group.exerciseName);

          return (
            <div key={group.exerciseId} className={`game-card p-4 border-l-4 ${ssColor}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{MUSCLE_EMOJI[exercise?.muscleGroup || ''] || '🏋️'}</span>
                  <h3 className="font-display font-bold text-sm">{group.exerciseName}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {group.supersetGroup && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/30 text-sky-600 font-semibold flex items-center gap-0.5">
                      <Link2 className="w-2.5 h-2.5" />SS
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1.5 -mr-1 rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
                        title="Exercise options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => openNoteEditor(group.exerciseId, group.exerciseName)}>
                        <StickyNote className="w-4 h-4 mr-2" />{sessionNotes[group.exerciseId] ? 'Edit Note' : 'Add Note'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSwitchMuscle(exercise?.muscleGroup || null);
                        setSwitchSearch('');
                        setSwitchTarget({ exerciseId: group.exerciseId, exerciseName: group.exerciseName });
                      }}>
                        <ArrowLeftRight className="w-4 h-4 mr-2" />Switch Exercise
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => suggestAlternative(group.exerciseId, 0)}>
                        <Sparkles className="w-4 h-4 mr-2" />AI Suggest Alternative
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addWarmupSet(group.exerciseId)}>
                        <Flame className="w-4 h-4 mr-2" />Add Warm-up Set
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRestTarget({ exerciseId: group.exerciseId, exerciseName: group.exerciseName })}>
                        <Timer className="w-4 h-4 mr-2" />Rest Timer{restConfig[group.exerciseId] ? ` · ${fmtTime(restConfig[group.exerciseId])}` : ' · Off'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleTrackMode(group.exerciseId, group.exerciseName)}>
                        <Clock className="w-4 h-4 mr-2" />Track by {timed ? 'Reps' : 'Time'}
                      </DropdownMenuItem>
                      {gi > 0 && (
                        <DropdownMenuItem onClick={() => toggleSessionSuperset(gi)}>
                          {group.supersetGroup
                            ? <><Unlink className="w-4 h-4 mr-2" />Unlink Superset</>
                            : <><Link2 className="w-4 h-4 mr-2" />Superset with Above</>}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => removeExerciseFromSession(group.exerciseId, group.exerciseName)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />Remove Exercise
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Per-exercise note (tap to edit) */}
              {sessionNotes[group.exerciseId] ? (
                <button
                  onClick={() => openNoteEditor(group.exerciseId, group.exerciseName)}
                  className="w-full text-left mb-2"
                >
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2 py-1.5">
                    <StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                    <span className="whitespace-pre-wrap flex-1">{sessionNotes[group.exerciseId]}</span>
                  </div>
                </button>
              ) : null}

              {/* Set headers */}
              <div className={`grid ${timed ? 'grid-cols-[32px_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_1fr_32px]'} gap-1 mb-1 px-1`}>
                <span className="text-[9px] font-mono text-muted-foreground uppercase">Set</span>
                <span className="text-[9px] font-mono text-muted-foreground uppercase">Previous</span>
                {timed ? (
                  <span className="text-[9px] font-mono text-muted-foreground uppercase">Time</span>
                ) : (
                  <>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">kg</span>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">Reps</span>
                  </>
                )}
                <span></span>
              </div>

              {group.sets.map((set, si) => {
                const globalIdx = sessionSets.indexOf(set);
                const prev = prevSets[si];
                const rowBg = set.completed ? 'bg-primary/5' : set.isWarmup ? 'bg-amber-50 dark:bg-amber-950/10' : 'bg-card';
                return (
                  <SwipeableSetRow key={si} onDelete={() => deleteSet(globalIdx)}>
                    <div className={`grid ${timed ? 'grid-cols-[32px_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_1fr_32px]'} gap-1 p-1 rounded-lg items-center ${rowBg}`}>
                      <span className={`text-[11px] font-mono text-center ${set.isWarmup ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {set.isWarmup ? 'W' : set.setNumber}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground text-center">
                        {timed
                          ? (prev?.duration != null ? fmtTime(prev.duration) : '—')
                          : (prev ? `${prev.weight} × ${prev.reps}` : '—')}
                      </span>
                      {timed ? (
                        <TimedInput
                          value={set.duration ?? null}
                          onCommit={(v) => setSessionSets(prev => prev.map((s, i) => i === globalIdx ? { ...s, duration: v } : s))}
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight ?? ''}
                            onChange={e => {
                              const v = e.target.value ? parseFloat(e.target.value) : null;
                              setSessionSets(prev => prev.map((s, i) => i === globalIdx ? { ...s, weight: v } : s));
                            }}
                            className="w-full bg-secondary/50 rounded px-2 py-1 text-sm font-mono text-center focus:ring-1 focus:ring-primary/30 outline-none"
                            placeholder="—"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={set.reps ?? ''}
                            onChange={e => {
                              const v = e.target.value ? parseInt(e.target.value) : null;
                              setSessionSets(prev => prev.map((s, i) => i === globalIdx ? { ...s, reps: v } : s));
                            }}
                            className="w-full bg-secondary/50 rounded px-2 py-1 text-sm font-mono text-center focus:ring-1 focus:ring-primary/30 outline-none"
                            placeholder="—"
                          />
                        </>
                      )}
                      <button
                        onClick={() => handleCompleteSet(globalIdx, prev)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          set.completed ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 hover:border-primary'
                        }`}
                      >
                        {set.completed && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </SwipeableSetRow>
                );
              })}

              {/* Add set button */}
              <button
                onClick={() => {
                  const lastSet = group.sets[group.sets.length - 1];
                  const newSet = {
                    ...lastSet,
                    setNumber: group.sets.filter(s => !s.isWarmup).length + 1,
                    completed: false,
                    isWarmup: false,
                  };
                  const lastIdx = sessionSets.lastIndexOf(lastSet);
                  setSessionSets(prev => [...prev.slice(0, lastIdx + 1), newSet, ...prev.slice(lastIdx + 1)]);
                }}
                className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-1 px-1"
              >
                <Plus className="w-3 h-3" />Add set
              </button>
            </div>
          );
        })}

        {/* Add exercise to session */}
        <AddExerciseToSession
          exercises={exercises}
          onAdd={(ex) => {
            const newSets = Array.from({ length: 3 }, (_, i) => ({
              exerciseId: ex.id,
              exerciseName: ex.name,
              setNumber: i + 1,
              weight: null,
              reps: null,
              duration: null,
              restSeconds: 90,
              isWarmup: false,
              isDropSet: false,
              completed: false,
              rpe: null,
              supersetGroup: null,
            }));
            setSessionSets(prev => [...prev, ...newSets]);
            // Load previous data for the new exercise
            loadPreviousData([...Object.keys(previousData), ex.id]);
          }}
        />
      </div>
    );
  }

  // === RENDER: EXERCISE DETAIL ===
  if (subView === 'exercise_detail' && selectedExercise) {
    const prs = prsByExercise[selectedExercise.id] || [];
    const recentSessions = sessions.filter(s =>
      s.sets?.some((set: any) => set.exerciseId === selectedExercise.id)
    );

    return (
      <div className="space-y-3">
        <button onClick={() => setSubView('library')} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" />Back to Library
        </button>

        {/* Exercise header */}
        <div className="game-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ExerciseThumbnail exercise={selectedExercise} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-lg">{selectedExercise.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full capitalize">{selectedExercise.muscleGroup.replace('_', ' ')}</span>
                {selectedExercise.equipment && (
                  <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full capitalize">{selectedExercise.equipment}</span>
                )}
                {selectedExercise.category && (
                  <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full capitalize">{selectedExercise.category}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="game-card p-1 flex gap-1">
          {(['about', 'history', 'records'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all
                ${detailTab === tab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}
              `}
            >{tab}</button>
          ))}
        </div>

        {/* About tab */}
        {detailTab === 'about' && (
          <div className="space-y-3">
            {/* Demonstration animation / illustration */}
            {(selectedExercise.animationUrl || selectedExercise.imageUrl) && (
              <div className="game-card p-3">
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedExercise.animationUrl || selectedExercise.imageUrl}
                    alt={`${selectedExercise.name} demonstration`}
                    className="w-full h-full object-contain"
                    onError={(e) => { (e.currentTarget.closest('.game-card') as HTMLElement)?.style.setProperty('display', 'none'); }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">Movement demonstration</p>
              </div>
            )}

            {/* Instructions */}
            {selectedExercise.guide ? (
              <div className="game-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-bold text-sm">Instructions</h3>
                  </div>
                  <button onClick={generateGuide} disabled={generatingGuide} className="text-[10px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
                    {generatingGuide ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Regenerate
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedExercise.guide.split(/(?:\d+\.\s|\n)/).filter(Boolean).map((step: string, i: number) => (
                    <div key={i} className="flex gap-2.5 text-[12px] leading-relaxed">
                      <span className="text-primary font-bold font-mono flex-shrink-0 mt-0.5">{i + 1}.</span>
                      <p className="text-foreground/80">{step.trim()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="game-card p-6 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No instructions yet.</p>
                <Button size="sm" onClick={generateGuide} disabled={generatingGuide} className="mt-3">
                  {generatingGuide ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate guide with AI
                </Button>
              </div>
            )}

            {/* Form cues / pointers */}
            {Array.isArray(selectedExercise.formCues) && selectedExercise.formCues.length > 0 && (
              <div className="game-card p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="font-display font-bold text-sm">Form Pointers</h3>
                </div>
                <div className="space-y-1.5">
                  {selectedExercise.formCues.map((cue: string, i: number) => (
                    <div key={i} className="flex gap-2 items-start text-[12px] leading-relaxed">
                      <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
                      <p className="text-foreground/80">{cue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My Notes (per-user remarks) */}
            <div className="game-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <StickyNote className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-bold text-sm">My Notes</h3>
                </div>
                {noteDraft !== exerciseNote && (
                  <button onClick={saveExerciseNote} disabled={savingNote} className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
                    {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                  </button>
                )}
              </div>
              <textarea
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add your own remarks — setup, cues that work for you, weights to remember, injuries to watch…"
                rows={3}
                className="w-full text-[12px] leading-relaxed bg-secondary/30 rounded-lg p-2.5 resize-y outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
              />
              {noteDraft !== exerciseNote && (
                <p className="text-[10px] text-muted-foreground mt-1">Unsaved changes</p>
              )}
            </div>
          </div>
        )}

        {/* History tab */}
        {detailTab === 'history' && (
          <div className="space-y-3">
            {/* Volume chart (simple bar representation) */}
            {volumeHistory.length > 0 && (
              <div className="game-card p-4">
                <h3 className="font-display font-bold text-sm mb-3">Volume Trend</h3>
                <div className="flex items-end gap-1 h-24">
                  {volumeHistory.map((v, i) => {
                    const maxVol = Math.max(1, ...volumeHistory.map(vh => vh.volume));
                    const height = (v.volume / maxVol) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[8px] text-muted-foreground font-mono">{v.volume > 0 ? `${Math.round(v.volume)}` : ''}</span>
                        <div
                          className="w-full rounded-t bg-primary/70 transition-all min-h-[2px]"
                          style={{ height: `${Math.max(2, height)}%` }}
                        />
                        <span className="text-[7px] text-muted-foreground">{v.date.split(' ')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Session list */}
            {recentSessions.length === 0 ? (
              <div className="game-card p-6 text-center">
                <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No history yet for this exercise.</p>
              </div>
            ) : (
              <div className="game-card p-4">
                <h3 className="font-display font-bold text-sm mb-2">Sessions</h3>
                {recentSessions.slice(0, 10).map((s: any) => {
                  const exSets = s.sets.filter((set: any) => set.exerciseId === selectedExercise.id);
                  return (
                    <div key={s.id} className="py-2.5 border-b border-border last:border-0">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[12px] font-semibold">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.startedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {exSets.map((set: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground w-6 font-mono">S{set.setNumber || i + 1}</span>
                            <span className={`font-mono flex-1 ${
                              set.isPR ? 'text-amber-600 dark:text-amber-400 font-bold' : ''
                            }`}>
                              {set.weight ? `${set.weight}kg × ${set.reps || 0}` : set.duration ? `${set.duration}s` : `${set.reps || 0} reps`}
                              {set.isPR && ' 🏆'}
                            </span>
                            {set.rpe && <span className="text-[9px] text-muted-foreground">RPE {set.rpe}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Records tab */}
        {detailTab === 'records' && (
          <div className="space-y-3">
            {prs.length === 0 ? (
              <div className="game-card p-6 text-center">
                <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No personal records yet.</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Complete workouts to set records!</p>
              </div>
            ) : (
              <div className="game-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="font-display font-bold text-sm">Personal Records</h3>
                </div>
                <div className="space-y-3">
                  {prs.map((pr: any) => (
                    <div key={pr.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                      <div>
                        <p className="text-xs font-semibold capitalize">{pr.recordType.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {pr.achievedAt ? new Date(pr.achievedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' }) : 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold font-mono text-primary">
                          {pr.recordType === 'max_weight' ? `${pr.value}kg` :
                           pr.recordType === 'max_reps' ? `${pr.value}` :
                           pr.recordType === 'max_volume' ? `${pr.value}` :
                           pr.recordType === 'est_1rm' ? `${pr.value}kg` :
                           pr.recordType === 'best_time' ? `${pr.value}s` :
                           pr.recordType === 'max_distance' ? `${pr.value}km` : pr.value}
                        </p>
                        <p className="text-[9px] text-muted-foreground uppercase">
                          {pr.recordType === 'max_weight' ? 'max weight' :
                           pr.recordType === 'max_reps' ? 'reps' :
                           pr.recordType === 'max_volume' ? 'volume (kg·reps)' :
                           pr.recordType === 'est_1rm' ? 'estimated 1RM' : pr.recordType.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // === RENDER: LIBRARY ===
  if (subView === 'library') {
    return (
      <div className="space-y-3">
        <button onClick={() => setSubView('home')} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" />Back
        </button>

        <div className="game-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-sm">Exercise Library</h2>
            <span className="text-[10px] text-muted-foreground font-mono">{filteredExercises.length}</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search exercises..."
              className="pl-9 text-sm h-9"
            />
          </div>

          {/* Muscle filter chips */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            <button
              onClick={() => setFilterMuscle(null)}
              className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                !filterMuscle ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
              }`}
            >All</button>
            {MUSCLE_GROUPS.map(mg => (
              <button key={mg}
                onClick={() => setFilterMuscle(filterMuscle === mg ? null : mg)}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors capitalize ${
                  filterMuscle === mg ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
                }`}
              >{MUSCLE_EMOJI[mg]} {mg.replace('_', ' ')}</button>
            ))}
          </div>

          {/* Equipment filter */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {EQUIPMENT_LIST.map(eq => (
              <button key={eq}
                onClick={() => setFilterEquipment(filterEquipment === eq ? null : eq)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors capitalize ${
                  filterEquipment === eq ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-secondary/50 hover:bg-secondary'
                }`}
              >{eq}</button>
            ))}
          </div>
        </div>

        {/* Exercise list by group */}
        {Object.entries(groupedExercises).map(([group, exs]) => (
          <div key={group} className="game-card p-4">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {MUSCLE_EMOJI[group]} {group.replace('_', ' ')}
            </h3>
            <div className="space-y-0.5">
              {exs.map((ex: any) => (
                <button key={ex.id}
                  onClick={() => { openExerciseDetail(ex); }}
                  className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-secondary/30 text-left group"
                >
                  <ExerciseThumbnail exercise={ex} size="sm" />
                  <span className="text-[13px] font-semibold flex-1">{ex.name}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{ex.equipment || 'bodyweight'}</span>
                  {prsByExercise[ex.id]?.length > 0 && <Trophy className="w-3 h-3 text-amber-400" />}
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // === RENDER: HISTORY ===
  if (subView === 'history') {
    return (
      <div className="space-y-3">
        <button onClick={() => setSubView('home')} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" />Back
        </button>

        <div className="game-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-sm">Workout History</h2>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No workouts yet. Start your first session!</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => {
                const uniqueMuscles = [...new Set(s.sets?.map((set: any) => set.exercise?.muscleGroup).filter(Boolean))];
                const totalVolume = s.sets?.reduce((sum: number, set: any) => sum + ((set.weight || 0) * (set.reps || 0)), 0) || 0;
                const prCount = s.sets?.filter((set: any) => set.isPR).length || 0;
                return (
                  <div key={s.id} className="p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[13px] font-bold">{s.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(s.startedAt).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          {s.durationMins && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Timer className="w-2.5 h-2.5" />{s.durationMins}min
                            </span>
                          )}
                          {prCount > 0 && (
                            <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                              <Trophy className="w-2.5 h-2.5" />{prCount} PR{prCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {s.sets?.length || 0} sets
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {uniqueMuscles.map((m: any) => (
                        <span key={m} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded-full capitalize">
                          {MUSCLE_EMOJI[m] || ''} {m?.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                    {totalVolume > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">Total volume: {totalVolume.toLocaleString()}kg</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === RENDER: TEMPLATE EDITOR ===
  if (editingTemplate !== null) {
    const handleTemplateSave = async (data: any) => {
      try {
        if (data.id) {
          // Update existing
          const r = await fetch(`/api/gym/templates/${data.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: data.name, description: data.description, exercises: data.exercises }),
          });
          if (r.ok) { toast.success('Template updated'); fetchData(); setEditingTemplate(null); }
          else toast.error('Failed to update');
        } else {
          // Create new
          await saveAsTemplate(data.name, data.exercises, data.description);
          setEditingTemplate(null);
        }
      } catch { toast.error('Failed to save'); }
    };
    return (
      <TemplateEditor
        exercises={exercises}
        initialData={editingTemplate.id ? {
          id: editingTemplate.id,
          name: editingTemplate.name,
          description: editingTemplate.description || '',
          exercises: editingTemplate.exercises || [],
        } : undefined}
        onSave={handleTemplateSave}
        onCancel={() => setEditingTemplate(null)}
      />
    );
  }

  // === RENDER: TEMPLATES ===
  if (subView === 'templates') {
    return (
      <div className="space-y-3">
        <button onClick={() => setSubView('home')} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" />Back
        </button>

        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-primary" />
              <h2 className="font-display font-bold text-sm">Workout Templates</h2>
            </div>
            <Button size="sm" onClick={() => setEditingTemplate({})}>
              <Plus className="w-3 h-3 mr-1" />Create
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-6">
              <Copy className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No templates yet</p>
              <p className="text-xs text-muted-foreground mb-3">Create a template to quickly start your favourite workouts</p>
              <Button size="sm" variant="outline" onClick={() => setEditingTemplate({})}>
                <Plus className="w-3.5 h-3.5 mr-1" />Create Template
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t: any) => {
                const exList = t.exercises || [];
                return (
                  <div key={t.id} className="p-3 rounded-lg bg-secondary/20">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-bold">{t.name}</p>
                          {t.isAiGenerated && <Sparkles className="w-3 h-3 text-primary" />}
                        </div>
                        {t.description && <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exList.slice(0, 4).map((ex: any, i: number) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary">
                              {ex.exerciseName}
                            </span>
                          ))}
                          {exList.length > 4 && <span className="text-[9px] text-muted-foreground">+{exList.length - 4} more</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => setEditingTemplate(t)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => deleteTemplate(t.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm"
                          onClick={() => startSession(t.name, exList, t.id)}
                          className="h-7">
                          <Play className="w-3 h-3 mr-1" />Start
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === RENDER: HOME (main gym dashboard) ===
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="game-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            <h1 className="font-display font-bold text-lg">Gym</h1>
          </div>
        </div>
      </div>

      {/* Templates (quick start) */}
      {templates.length > 0 && (
        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display font-bold text-sm">Templates</h2>
            </div>
            <button onClick={() => setSubView('templates')} className="text-[10px] text-primary hover:underline">See all</button>
          </div>
          <div className="space-y-1">
            {templates.slice(0, 3).map((t: any) => (
              <button key={t.id}
                onClick={() => startSession(t.name, t.exercises || [], t.id)}
                className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-secondary/30 text-left"
              >
                <Play className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="text-[13px] font-semibold flex-1 truncate">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">{(t.exercises || []).length} ex</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty workout start */}
      <button
        onClick={() => startSession('Quick Workout', [])}
        className="game-card p-4 w-full text-left hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-bold">Start Empty Workout</p>
            <p className="text-[10px] text-muted-foreground">Build as you go — add exercises during your session</p>
          </div>
        </div>
      </button>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div className="game-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display font-bold text-sm">Recent</h2>
            </div>
            <button onClick={() => setSubView('history')} className="text-[10px] text-primary hover:underline">See all</button>
          </div>
          <div className="space-y-1">
            {sessions.slice(0, 3).map((s: any) => {
              const prCount = s.sets?.filter((set: any) => set.isPR).length || 0;
              return (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/30">
                  <Flame className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {s.durationMins ? ` · ${s.durationMins}min` : ''}
                      {prCount > 0 ? ` · ${prCount} PR` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{s.sets?.length || 0} sets</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nav buttons */}
      <section className="grid grid-cols-3 gap-2">
        <button onClick={() => setSubView('library')} className="game-card p-3 text-center hover:shadow-md transition-all group">
          <Dumbbell className="w-5 h-5 text-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-semibold text-muted-foreground">Library</p>
        </button>
        <button onClick={() => setSubView('history')} className="game-card p-3 text-center hover:shadow-md transition-all group">
          <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-1 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-semibold text-muted-foreground">History</p>
        </button>
        <button onClick={() => setSubView('templates')} className="game-card p-3 text-center hover:shadow-md transition-all group">
          <Copy className="w-5 h-5 text-muted-foreground mx-auto mb-1 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-semibold text-muted-foreground">Templates</p>
        </button>
      </section>
    </div>
  );
}

// === ADD EXERCISE TO SESSION (inline picker) ===
function AddExerciseToSession({ exercises, onAdd }: { exercises: any[]; onAdd: (ex: any) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = exercises.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="game-card p-3 w-full text-center text-sm text-primary hover:shadow-md transition-all flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" />Add Exercise
      </button>
    );
  }

  return (
    <div className="game-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-sm">Add Exercise</h3>
        <button onClick={() => { setOpen(false); setSearch(''); }}><X className="w-4 h-4" /></button>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm h-8" autoFocus />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.slice(0, 20).map(ex => (
          <button key={ex.id}
            onClick={() => { onAdd(ex); setOpen(false); setSearch(''); }}
            className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-secondary/30 text-left"
          >
            <span className="text-sm">{MUSCLE_EMOJI[ex.muscleGroup] || '🏋️'}</span>
            <span className="text-[12px] font-semibold flex-1">{ex.name}</span>
            <span className="text-[9px] text-muted-foreground capitalize">{ex.equipment || 'bw'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// === TIMED SET INPUT (m:ss, commits on blur so typing isn't reformatted mid-entry) ===
function TimedInput({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const fmt = (sec: number | null) => {
    if (sec == null) return '';
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };
  const [text, setText] = useState(fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);
  const commit = () => {
    const t = text.trim();
    let v: number | null = null;
    if (t) {
      if (t.includes(':')) { const [m, s] = t.split(':'); v = (parseInt(m) || 0) * 60 + (parseInt(s) || 0); }
      else { const n = parseInt(t); v = isNaN(n) ? null : n; }
    }
    onCommit(v);
    setText(fmt(v));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-full bg-secondary/50 rounded px-2 py-1 text-sm font-mono text-center focus:ring-1 focus:ring-primary/30 outline-none"
      placeholder="0:00"
    />
  );
}

// === SWIPEABLE SET ROW (swipe-left to reveal Delete) ===
function SwipeableSetRow({ children, onDelete }: { children: any; onDelete: () => void }) {
  const [tx, setTx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const REVEAL = 76;

  const onDown = (e: any) => { startX.current = e.clientX; setDragging(true); };
  const onMove = (e: any) => {
    if (!dragging) return;
    let dx = e.clientX - startX.current + (open ? -REVEAL : 0);
    if (dx > 0) dx = 0;
    if (dx < -REVEAL) dx = -REVEAL;
    setTx(dx);
  };
  const end = () => {
    if (!dragging) return;
    setDragging(false);
    const shouldOpen = tx < -REVEAL / 2;
    setOpen(shouldOpen);
    setTx(shouldOpen ? -REVEAL : 0);
  };

  return (
    <div className="relative overflow-hidden rounded-lg select-none">
      <button
        onClick={() => { onDelete(); setOpen(false); setTx(0); }}
        className="absolute right-0 top-0 bottom-0 flex items-center gap-1 px-3 bg-red-500 text-white text-xs font-semibold"
        style={{ width: REVEAL }}
      >
        <Trash2 className="w-3.5 h-3.5" />Delete
      </button>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        className="relative bg-card touch-pan-y"
        style={{ transform: `translateX(${tx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease' }}
      >
        {children}
      </div>
    </div>
  );
}
