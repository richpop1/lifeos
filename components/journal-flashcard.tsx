'use client';
import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface MoodOption {
  key: string;
  emoji: string;
  label: string;
}

interface Props {
  sessionType: 'morning' | 'evening';
  prompts: string[];
  moods: MoodOption[];
  onComplete: () => void;
  onCancel: () => void;
}

type Phase = 'mood-start' | 'questions' | 'mood-end' | 'saving';

export function JournalFlashcard({ sessionType, prompts, moods, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('mood-start');
  const [moodStart, setMoodStart] = useState<string | null>(null);
  const [moodEnd, setMoodEnd] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [responses, setResponses] = useState<{ question: string; answer: string }[]>([]);

  const totalSteps = (prompts?.length ?? 0) + 2; // 2 mood steps
  const currentStep = phase === 'mood-start' ? 1 : phase === 'questions' ? currentQ + 2 : totalSteps;

  const handleMoodStartSelect = (key: string) => {
    setMoodStart(key);
    setPhase('questions');
  };

  const handleNextQuestion = () => {
    if (!currentAnswer?.trim()) {
      toast.error('Please answer before continuing');
      return;
    }
    const safePrompts = prompts ?? [];
    const newResponses = [...(responses ?? []), { question: safePrompts[currentQ] ?? '', answer: currentAnswer.trim() }];
    setResponses(newResponses);
    setCurrentAnswer('');

    if (currentQ + 1 >= (safePrompts?.length ?? 0)) {
      setPhase('mood-end');
    } else {
      setCurrentQ(currentQ + 1);
    }
  };

  const handleMoodEndSelect = async (key: string) => {
    setMoodEnd(key);
    setPhase('saving');
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          moodStart,
          moodEnd: key,
          responses,
        }),
      });
      if (res.ok) {
        toast.success('Journal entry saved!');
        onComplete();
      } else {
        toast.error('Failed to save');
        setPhase('mood-end');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Error saving entry');
      setPhase('mood-end');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleNextQuestion();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{currentStep}/{totalSteps}</span>
          <div className="w-32 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <div className="w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <AnimatePresence mode="wait">
          {/* Mood Start */}
          {phase === 'mood-start' && (
            <motion.div
              key="mood-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <h2 className="font-display text-xl font-bold mb-2">How are you feeling?</h2>
              <p className="text-sm text-muted-foreground mb-6">Select your current mood to begin your {sessionType} session.</p>
              <div className="grid grid-cols-4 gap-3">
                {(moods ?? []).map((mood: MoodOption) => (
                  <button
                    key={mood.key}
                    onClick={() => handleMoodStartSelect(mood.key)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card hover:bg-secondary transition-colors"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  >
                    <span className="text-2xl">{mood.emoji}</span>
                    <span className="text-[10px] text-muted-foreground">{mood.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Questions */}
          {phase === 'questions' && (
            <motion.div
              key={`q-${currentQ}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-md"
            >
              <div className="bg-card rounded-2xl p-8 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
                <p className="font-display text-lg font-semibold mb-6 leading-relaxed">
                  {(prompts ?? [])[currentQ] ?? ''}
                </p>
                <textarea
                  value={currentAnswer}
                  onChange={(e: any) => setCurrentAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Type your answer here..."
                  autoFocus
                />
                <Button
                  onClick={handleNextQuestion}
                  className="mt-4 w-full"
                  disabled={!currentAnswer?.trim()}
                >
                  {currentQ + 1 >= (prompts?.length ?? 0) ? (
                    <><Check className="w-4 h-4 mr-1" /> Finish Questions</>
                  ) : (
                    <><ArrowRight className="w-4 h-4 mr-1" /> Next Question</>
                  )}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">Press Enter to continue</p>
            </motion.div>
          )}

          {/* Mood End */}
          {phase === 'mood-end' && (
            <motion.div
              key="mood-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <h2 className="font-display text-xl font-bold mb-2">How are you feeling now?</h2>
              <p className="text-sm text-muted-foreground mb-6">After reflecting, how has your mood shifted?</p>
              <div className="grid grid-cols-4 gap-3">
                {(moods ?? []).map((mood: MoodOption) => (
                  <button
                    key={mood.key}
                    onClick={() => handleMoodEndSelect(mood.key)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card hover:bg-secondary transition-colors"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  >
                    <span className="text-2xl">{mood.emoji}</span>
                    <span className="text-[10px] text-muted-foreground">{mood.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Saving */}
          {phase === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Saving your entry...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
