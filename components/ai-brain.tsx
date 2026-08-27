'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Brain, Send, Loader2, X, ChevronDown,
  CheckCircle2, AlertCircle, Zap, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tool?: string;
  action?: string;
  timestamp: Date;
}

const TOOL_ICONS: Record<string, string> = {
  add_task: '✅', edit_task: '✏️', resolve_task: '✅', delete_task: '🗑️', list_tasks: '📋',
  add_goal: '🎯', edit_goal: '✏️', delete_goal: '🗑️', list_goals: '📋',
  add_habit: '✨', edit_habit: '✏️', log_habit: '🔥', delete_habit: '🗑️',
  add_transaction: '💰', query_spending: '📊',
  quick_journal: '✍️', query_journal: '📖',
  add_contact: '👤', edit_contact: '✏️', add_contact_note: '📝', query_contacts: '👤',
  add_event: '📅', edit_event: '✏️', delete_event: '🗑️',
  update_scores: '📊', update_preference: '⚙️', update_profile: '👤',
  email_action: '📧', query_general: '🧠',
};

const QUICK_ACTIONS = [
  { label: 'Add task', prompt: 'Add task: ' },
  { label: 'Log spending', prompt: 'I spent $' },
  { label: 'Log habit', prompt: 'Done with ' },
  { label: 'Quick note', prompt: 'Note: ' },
  { label: 'My tasks', prompt: 'List my tasks' },
  { label: 'My goals', prompt: 'List my goals' },
];

export function AiBrain() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showQuickActions, setShowQuickActions] = useState(true);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setShowQuickActions(false);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg, history }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.result || 'Done.',
        tool: data.tool,
        action: data.action,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Dispatch refresh events based on what was changed
      if (data.action) {
        window.dispatchEvent(new CustomEvent('ai:action', { detail: { tool: data.tool, action: data.action, data: data.data } }));
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Something went wrong. Try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Trigger Button — positioned in top-right */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-40 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95"
        aria-label="AI Brain"
      >
        <Brain className="w-5 h-5" />
      </button>

      {/* Full-screen AI Chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-background flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/95 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Life OS Brain</h2>
                  <p className="text-[10px] text-muted-foreground">Full control over your life system</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">What do you need?</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    I can create tasks, log habits, track spending, manage contacts, schedule events, and more. Just tell me.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-card border border-border rounded-bl-md'
                    }`}
                  >
                    {msg.tool && msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs">{TOOL_ICONS[msg.tool] || '🤖'}</span>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          {msg.tool.replace(/_/g, ' ')}
                        </span>
                        {msg.action && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {msg.action}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            {showQuickActions && messages.length === 0 && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => {
                        setInput(action.prompt);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tell me what to do..."
                  className="flex-1 h-10 px-4 rounded-full bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="h-10 w-10 rounded-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
