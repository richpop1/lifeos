'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Smile, Frown, Meh, Heart, Zap, Sun,
  ChevronRight, Check, Star, Moon, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  scores: any[];
  onScoreAdded: () => void;
}

const MOOD_OPTIONS = [
  { key: 'great', emoji: '😊', label: 'Great', value: 5 },
  { key: 'good', emoji: '🙂', label: 'Good', value: 4 },
  { key: 'okay', emoji: '😐', label: 'Okay', value: 3 },
  { key: 'low', emoji: '😞', label: 'Low', value: 2 },
  { key: 'rough', emoji: '😫', label: 'Rough', value: 1 },
];

const QUICK_QUESTIONS = [
  { id: 'win', prompt: 'What was today\'s win?', placeholder: 'One thing that went well...', icon: Star },
  { id: 'learn', prompt: 'What did you learn?', placeholder: 'A realization or insight...', icon: Sparkles },
  { id: 'tomorrow', prompt: 'What matters most tomorrow?', placeholder: 'Your #1 priority...', icon: Sun },
];

export function ReflectView({ scores, onScoreAdded }: Props) {
  const [step, setStep] = useState<'mood' | 'questions' | 'done'>('mood');
  const [mood, setMood] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [saving, setSaving] = useState(false);
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check if already reflected today
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const res = await fetch('/api/journal?limit=1');
        if (res.ok) {
          const entries = await res.json();
          if (entries.length > 0) {
            const latest = entries[0];
            const today = new Date();
            const entryDate = new Date(latest.date);
            if (
              entryDate.toDateString() === today.toDateString() &&
              latest.sessionType === 'evening'
            ) {
              setTodayEntry(latest);
            }
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    checkExisting();
  }, []);

  const saveReflection = async () => {
    setSaving(true);
    try {
      const responses = QUICK_QUESTIONS.map(q => ({
        question: q.prompt,
        answer: answers[q.id] || '',
      })).filter(r => r.answer);

      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType: 'evening',
          moodEnd: mood,
          responses,
          dayTitle: answers.win ? `Win: ${answers.win.slice(0, 50)}` : 'Evening reflection',
          signal: answers.learn || null,
          focusItem: answers.tomorrow || null,
        }),
      });

      if (res.ok) {
        setStep('done');
        toast.success('Reflection saved ✨');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentQ < QUICK_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      saveReflection();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-48 bg-muted rounded-2xl" />
      </div>
    );
  }

  // Already reflected today
  if (todayEntry) {
    const responses = todayEntry.responses as any[] || [];
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold">Today's Reflection</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          {todayEntry.moodEnd && (
            <div className="text-center mb-4">
              <span className="text-4xl">{MOOD_OPTIONS.find(m => m.key === todayEntry.moodEnd)?.emoji || todayEntry.moodEnd}</span>
            </div>
          )}
          {responses.map((r: any, i: number) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="text-xs text-muted-foreground font-medium mb-0.5">{r.question}</p>
              <p className="text-sm">{r.answer}</p>
            </div>
          ))}
          {todayEntry.dayTitle && (
            <p className="text-xs text-primary/70 italic mt-3 pt-3 border-t border-border">{todayEntry.dayTitle}</p>
          )}
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setTodayEntry(null);
            setStep('mood');
            setMood(null);
            setAnswers({});
            setCurrentQ(0);
          }}
        >
          Reflect again
        </Button>
      </div>
    );
  }

  // Done state
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Day closed ✨</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your reflection is saved. Rest well — tomorrow's focus is set.
        </p>
      </div>
    );
  }

  // Mood selection
  if (step === 'mood') {
    return (
      <div className="space-y-6">
        <div className="text-center pt-8">
          <Moon className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold">How was today?</h1>
          <p className="text-sm text-muted-foreground mt-1">Tap to set your mood, then 3 quick questions</p>
        </div>
        <div className="flex justify-center gap-4 py-4">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMood(m.key);
                setStep('questions');
              }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all
                ${mood === m.key
                  ? 'border-primary bg-primary/5 scale-110'
                  : 'border-transparent hover:bg-muted'
                }
              `}
            >
              <span className="text-3xl">{m.emoji}</span>
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Questions flow
  const q = QUICK_QUESTIONS[currentQ];
  const QIcon = q.icon;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1.5 justify-center pt-4">
        {QUICK_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i <= currentQ ? 'bg-primary w-8' : 'bg-muted w-6'
            }`}
          />
        ))}
      </div>

      <div className="text-center">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <QIcon className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-lg font-bold">{q.prompt}</h2>
      </div>

      <textarea
        value={answers[q.id] || ''}
        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
        placeholder={q.placeholder}
        className="w-full h-32 p-4 rounded-2xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
        autoFocus
      />

      <div className="flex gap-3">
        {currentQ > 0 && (
          <Button variant="outline" onClick={() => setCurrentQ(currentQ - 1)} className="flex-1">
            Back
          </Button>
        )}
        <Button
          onClick={handleNextQuestion}
          disabled={saving}
          className="flex-1"
        >
          {saving ? 'Saving...' : currentQ < QUICK_QUESTIONS.length - 1 ? 'Next' : 'Done ✨'}
        </Button>
      </div>

      {/* Skip option */}
      {!answers[q.id] && (
        <button
          onClick={handleNextQuestion}
          className="block mx-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Skip this question
        </button>
      )}
    </div>
  );
}
