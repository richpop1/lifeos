'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, X, ChevronUp, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface CommandResult {
  result: string;
  tool?: string;
  data?: any;
}

export function CommandBar({ onRefresh }: { onRefresh?: () => void }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ cmd: string; result: CommandResult }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const execute = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setExpanded(true);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastResult(data);
        setHistory(prev => [{ cmd: text, result: data }, ...prev].slice(0, 10));
        // Refresh parent data if action was taken
        if (['add_transaction', 'add_task', 'log_habit', 'quick_journal'].includes(data.tool)) {
          onRefresh?.();
        }
      } else {
        toast.error('Command failed');
      }
    } catch {
      toast.error('Failed to execute command');
    }
    setLoading(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  return (
    <div className="game-card overflow-hidden">
      {/* Input bar */}
      <div className="flex items-center gap-2 p-3">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && execute()}
          onFocus={() => history.length > 0 && setExpanded(true)}
          placeholder='Ask or command anything... (e.g. "spent $15 on lunch", "how much this week?")'
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          disabled={loading}
        />
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : input.trim() ? (
          <button onClick={execute} className="p-1 rounded-md hover:bg-secondary transition-colors">
            <Send className="w-4 h-4 text-primary" />
          </button>
        ) : (
          <span className="text-[9px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-secondary/60">Jarvis</span>
        )}
      </div>

      {/* Result area — action log */}
      <AnimatePresence>
        {expanded && (lastResult || history.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            {/* Current result with command echo */}
            {lastResult && (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-primary font-semibold">{TOOL_LABELS[lastResult.tool || ''] || '🤖 Response'}</span>
                  <button onClick={() => { setExpanded(false); setLastResult(null); }} className="p-0.5 rounded hover:bg-secondary">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                {/* Echo the command */}
                {history.length > 0 && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground font-mono flex-shrink-0">You:</span>
                    <span className="text-foreground/80 italic">{history[0].cmd}</span>
                  </div>
                )}
                {/* Jarvis response */}
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-2.5">
                  <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{lastResult.result}</p>
                </div>
              </div>
            )}

            {/* Recent command history */}
            {history.length > 1 && (
              <div className="border-t border-border/50 px-3 py-2">
                <button onClick={() => setShowHistory(p => !p)} className="text-[9px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 w-full">
                  <ChevronUp className={`w-2.5 h-2.5 transition-transform ${showHistory ? '' : 'rotate-180'}`} />
                  <MessageSquare className="w-2.5 h-2.5" /> History ({history.length - 1})
                </button>
                {showHistory && (
                  <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                    {history.slice(1).map((h, i) => (
                      <div key={i} className="text-[11px] p-1.5 rounded bg-secondary/30">
                        <p className="text-muted-foreground truncate"><span className="font-mono">›</span> {h.cmd}</p>
                        <p className="text-foreground/70 truncate text-[10px] mt-0.5">{h.result.result}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
