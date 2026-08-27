'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, X, ChevronUp, MessageSquare,
  Play, Copy, Edit3, Camera, ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface CommandResult {
  result: string;
  tool?: string;
  data?: any;
}

interface GymSuggestion {
  name: string;
  description?: string;
  durationMins?: number;
  exercises: { exerciseName: string; sets: number; reps: string; restSeconds?: number; exerciseId?: string }[];
}

interface JarvisFABProps {
  activeTab: string;
  onRefresh?: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  add_transaction: '💰 Transaction logged',
  add_task: '✅ Task created',
  log_habit: '🔥 Habit logged',
  query_spending: '📊 Spending query',
  query_journal: '📖 Journal search',
  query_contacts: '👤 Contact lookup',
  quick_journal: '✍️ Quick note saved',
  query_general: '🧠 Life query',
};

const GYM_CHIPS = ['Full body 45min', 'Upper body strength', 'Quick core blast', 'Leg day', 'HIIT cardio 20min'];

export function JarvisFAB({ activeTab, onRefresh }: JarvisFABProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [gymSuggestion, setGymSuggestion] = useState<GymSuggestion | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ cmd: string; result: CommandResult; isGym?: boolean }[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const isGymContext = activeTab === 'gym';

  // Determine if input should route to gym suggest
  const shouldRouteToGym = useCallback((text: string) => {
    if (!isGymContext) return false;
    // If on gym tab, always route to gym suggest unless it looks like a general command
    const generalPatterns = /^(spent|paid|bought|log|add task|remind|how much|what|journal|note)/i;
    return !generalPatterns.test(text.trim());
  }, [isGymContext]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image too large (max 10MB)'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const executeWithImage = async () => {
    if (!imagePreview || loading) return;
    setLoading(true);
    setLastResult(null);
    setGymSuggestion(null);
    const text = input.trim();
    setInput('');

    try {
      const res = await fetch('/api/command/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imagePreview, text: text || undefined, activeTab }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastResult(data);
        setHistory(prev => [{ cmd: text || '📷 Image sent', result: data }, ...prev].slice(0, 10));
        if (['add_transaction'].includes(data.tool)) {
          onRefresh?.();
          window.dispatchEvent(new CustomEvent('jarvis:dataChanged'));
        }
      } else {
        toast.error('Failed to process image');
      }
    } catch {
      toast.error('Image processing failed');
    }
    setImagePreview(null);
    setLoading(false);
  };

  const execute = async (overrideText?: string) => {
    // If there's an image, route to image handler
    if (imagePreview) { executeWithImage(); return; }

    const text = (overrideText || input).trim();
    if (!text || loading) return;
    if (!overrideText) setInput('');
    setLoading(true);
    setGymSuggestion(null);
    setLastResult(null);

    try {
      if (shouldRouteToGym(text)) {
        // Route to gym suggest API
        const r = await fetch('/api/gym/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        if (r.ok) {
          const data = await r.json();
          setGymSuggestion(data);
          const summary: CommandResult = { result: `🏋️ ${data.name} — ${data.exercises?.length} exercises`, tool: 'gym_suggest' };
          setHistory(prev => [{ cmd: text, result: summary, isGym: true }, ...prev].slice(0, 10));
        } else {
          const errData = await r.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[JARVIS GYM] Suggest failed:', r.status, errData);
          toast.error(errData?.error || 'Failed to generate workout — tap to retry', {
            action: { label: 'Retry', onClick: () => execute(text) },
          });
        }
      } else {
        // Route to general command API
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          setLastResult(data);
          setHistory(prev => [{ cmd: text, result: data }, ...prev].slice(0, 10));
          if (['add_transaction', 'add_task', 'log_habit', 'quick_journal'].includes(data.tool)) {
            onRefresh?.();
            window.dispatchEvent(new CustomEvent('jarvis:dataChanged'));
          }
        } else {
          toast.error('Command failed');
        }
      }
    } catch {
      toast.error('Failed to execute command');
    }
    setLoading(false);
  };

  const handleGymChip = (text: string) => {
    setInput('');
    execute(text);
  };

  const handleSaveTemplate = () => {
    if (!gymSuggestion) return;
    window.dispatchEvent(new CustomEvent('jarvis:saveGymTemplate', {
      detail: { name: gymSuggestion.name, exercises: gymSuggestion.exercises, description: gymSuggestion.description }
    }));
  };

  const handleStartSession = () => {
    if (!gymSuggestion) return;
    window.dispatchEvent(new CustomEvent('jarvis:startGymSession', {
      detail: { name: gymSuggestion.name, exercises: gymSuggestion.exercises }
    }));
    setOpen(false);
  };

  const clearResult = () => {
    setLastResult(null);
    setGymSuggestion(null);
  };

  const placeholder = isGymContext
    ? 'Ask Jarvis for a workout, or type a command...'
    : 'Ask or command anything... (e.g. "spent $15 on lunch")';

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-[45%] right-3 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            aria-label="Open Jarvis"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.div
              ref={panelRef}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] flex flex-col bg-card border-t border-border rounded-t-2xl shadow-2xl sm:left-auto sm:right-4 sm:bottom-4 sm:rounded-2xl sm:max-w-[420px] sm:max-h-[70vh] sm:border"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <span className="font-display font-bold text-sm">Jarvis</span>
                    {isGymContext && (
                      <span className="text-[9px] ml-1.5 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 font-mono">GYM</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {/* Gym chips (when on gym tab and no active result) */}
                {isGymContext && !gymSuggestion && !lastResult && !loading && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Quick workouts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {GYM_CHIPS.map(q => (
                        <button
                          key={q}
                          onClick={() => handleGymChip(q)}
                          className="text-[11px] bg-primary/10 text-primary px-2.5 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
                        >{q}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="flex items-center gap-3 py-6 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{isGymContext ? 'Crafting your workout...' : 'Thinking...'}</span>
                  </div>
                )}

                {/* Gym suggestion result */}
                {gymSuggestion && !loading && (
                  <div className="space-y-3">
                    {history.length > 0 && (
                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="text-muted-foreground font-mono flex-shrink-0">You:</span>
                        <span className="text-foreground/80 italic">{history[0].cmd}</span>
                      </div>
                    )}
                    <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                      <p className="font-bold text-sm">{gymSuggestion.name}</p>
                      {gymSuggestion.description && <p className="text-[11px] text-muted-foreground mt-0.5">{gymSuggestion.description}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {gymSuggestion.exercises?.length} exercises{gymSuggestion.durationMins ? ` · ~${gymSuggestion.durationMins}min` : ''}
                      </p>
                      <div className="space-y-1 mt-2">
                        {gymSuggestion.exercises?.map((ex, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                            <span className="font-medium flex-1">{ex.exerciseName}</span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {ex.sets}×{ex.reps}{ex.restSeconds ? ` (${ex.restSeconds}s)` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={clearResult} className="text-xs">
                        <X className="w-3 h-3 mr-1" />Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSaveTemplate} className="text-xs">
                        <Copy className="w-3 h-3 mr-1" />Save Template
                      </Button>
                      <Button size="sm" onClick={handleStartSession} className="text-xs">
                        <Play className="w-3 h-3 mr-1" />Start
                      </Button>
                    </div>
                  </div>
                )}

                {/* General command result */}
                {lastResult && !loading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-primary font-semibold">{TOOL_LABELS[lastResult.tool || ''] || '🤖 Response'}</span>
                      <button onClick={clearResult} className="p-0.5 rounded hover:bg-secondary">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                    {history.length > 0 && (
                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="text-muted-foreground font-mono flex-shrink-0">You:</span>
                        <span className="text-foreground/80 italic">{history[0].cmd}</span>
                      </div>
                    )}
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-2.5">
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{lastResult.result}</p>
                    </div>
                  </div>
                )}

                {/* History */}
                {history.length > 1 && (
                  <div className="pt-2 border-t border-border/50">
                    <button onClick={() => setShowHistory(p => !p)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 w-full">
                      <ChevronUp className={`w-2.5 h-2.5 transition-transform ${showHistory ? '' : 'rotate-180'}`} />
                      <MessageSquare className="w-2.5 h-2.5" /> History ({history.length - 1})
                    </button>
                    {showHistory && (
                      <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                        {history.slice(1).map((h, i) => (
                          <div key={i} className="text-[11px] p-1.5 rounded-lg bg-secondary/30">
                            <p className="text-muted-foreground truncate"><span className="font-mono">›</span> {h.cmd}</p>
                            <p className="text-foreground/70 truncate text-[10px] mt-0.5">{h.result.result}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!loading && !lastResult && !gymSuggestion && history.length === 0 && !isGymContext && (
                  <div className="text-center py-4">
                    <Sparkles className="w-8 h-8 text-primary/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Ask me anything or give me a command.</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">"spent $15 lunch" · "add task buy groceries" · "how much this week?"</p>
                  </div>
                )}
              </div>

              {/* Image preview */}
              {imagePreview && (
                <div className="px-4 py-2 border-t border-border">
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Preview" className="h-20 rounded-lg object-cover" />
                    <button onClick={() => setImagePreview(null)} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Add a message or send directly</p>
                </div>
              )}

              {/* Input bar (always visible at bottom) */}
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  {/* Camera/Upload buttons */}
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                  <button onClick={() => cameraInputRef.current?.click()} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Take photo">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Upload image">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && execute()}
                    placeholder={imagePreview ? 'Add context about this image...' : placeholder}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                    disabled={loading}
                  />
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (input.trim() || imagePreview) ? (
                    <button onClick={() => execute()} className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[9px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-secondary/60">⌘K</span>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
