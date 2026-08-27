'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Loader2, Shield, ShieldCheck, ShieldX,
  CheckCircle2, XCircle, Bot, User, AlertTriangle, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Butler Chat Surface — agentic conversational UI.
 * Calls POST /api/butler/chat, renders tool actions inline,
 * and shows approval-gate cards for confirm/block-tier tools.
 */

interface ToolAction {
  tool: string;
  result: any;
}

interface ApprovalGate {
  toolCallId: string;
  preview: string;
  status: 'pending' | 'approved' | 'rejected';
  result?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolActions?: ToolAction[];
  approvalGate?: ApprovalGate;
  runId?: string;
  agentStatus?: 'completed' | 'approval_needed' | 'failed' | 'safety_stopped';
}

const TOOL_LABELS: Record<string, string> = {
  add_task: 'Create task', edit_task: 'Edit task', resolve_task: 'Resolve task', delete_task: 'Delete task', list_tasks: 'List tasks',
  add_goal: 'Create goal', edit_goal: 'Edit goal', delete_goal: 'Delete goal', list_goals: 'List goals',
  add_transaction: 'Log transaction', query_spending: 'Query spending',
  quick_journal: 'Journal note', query_journal: 'Search journal',
  add_contact: 'Add contact', edit_contact: 'Edit contact', add_contact_note: 'Add note', query_contacts: 'Look up contact',
  add_event: 'Create event', edit_event: 'Edit event', delete_event: 'Delete event',
  update_scores: 'Update scores', update_profile: 'Update profile', update_preference: 'Update preference',
  email_action: 'Email action',
  create_loop: 'Create loop', update_loop: 'Triage loop', list_loops: 'List loops',
  store_memory: 'Store memory', recall_memory: 'Recall memory',
  create_decision: 'Create decision', log_event: 'Log event',
  query_general: 'Thinking...',
};

export function ButlerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/butler/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      // data: { runId, status, finalMessage?, toolCallId?, preview?, transcript }

      // Extract tool actions from transcript
      const toolActions: ToolAction[] = (data.transcript || [])
        .filter((t: any) => t.action)
        .map((t: any) => ({ tool: t.action, result: t.result }));

      // Build assistant message
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.finalMessage || '',
        timestamp: new Date(),
        toolActions: toolActions.length > 0 ? toolActions : undefined,
        runId: data.runId,
        agentStatus: data.status,
      };

      // If approval needed, attach the gate
      if (data.status === 'approval_needed' && data.toolCallId) {
        assistantMsg.approvalGate = {
          toolCallId: data.toolCallId,
          preview: data.preview || 'Action requires your approval',
          status: 'pending',
        };
        assistantMsg.content = ''; // Don't show content, the card IS the message
      }

      setMessages(prev => [...prev, assistantMsg]);

      // Dispatch refresh for completed tool executions
      if (data.status === 'completed' && toolActions.length > 0) {
        window.dispatchEvent(new CustomEvent('ai:action', {
          detail: { tool: toolActions[0].tool, action: 'executed' },
        }));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Something went wrong: ${errMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading]);

  const handleApproval = useCallback(async (msgId: string, toolCallId: string, approved: boolean) => {
    setApprovingId(toolCallId);
    try {
      const res = await fetch('/api/butler/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, approved }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Update the message's approval gate in-place
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return {
          ...m,
          approvalGate: {
            ...m.approvalGate!,
            status: approved ? 'approved' : 'rejected',
            result: approved && data.result?.result
              ? data.result.result
              : approved ? 'Action executed successfully.' : 'Action rejected.',
          },
        };
      }));

      if (approved) {
        toast.success('Action approved and executed');
        window.dispatchEvent(new CustomEvent('ai:action', {
          detail: { tool: 'approval', action: 'executed' },
        }));
      } else {
        toast.info('Action rejected');
      }
    } catch (err) {
      toast.error('Approval failed — try again');
    } finally {
      setApprovingId(null);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border mb-1">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Butler</h2>
          <p className="text-xs text-muted-foreground">Your chief-of-staff. Acts first, explains second.</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">What can I help you with?</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              I can manage tasks, goals, finances, contacts, email, and calendar.
              Sensitive actions need your approval before executing.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {['Add a task for tomorrow', 'Log $15 lunch expense', "What's on my plate today?", 'Schedule a call with Marcus'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] space-y-2 ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5'
                : msg.role === 'system'
                  ? 'bg-destructive/10 text-destructive rounded-2xl px-4 py-2.5'
                  : 'space-y-2'
            }`}>
              {/* User / system message content */}
              {msg.role !== 'assistant' && msg.content && (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Assistant: tool action chips */}
              {msg.role === 'assistant' && msg.toolActions && msg.toolActions.length > 0 && (
                <div className="space-y-1.5">
                  {msg.toolActions.map((ta, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl bg-card border border-border">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{TOOL_LABELS[ta.tool] || ta.tool}</p>
                        <p className="text-sm text-foreground">{ta.result?.result || 'Done'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Assistant: text content */}
              {msg.role === 'assistant' && msg.content && (
                <div className="px-3 py-2 rounded-xl bg-muted/50">
                  <p className="text-sm whitespace-pre-wrap text-foreground">{msg.content}</p>
                </div>
              )}

              {/* ═══ APPROVAL GATE CARD ═══ */}
              {msg.approvalGate && (
                <div className={`rounded-2xl border-2 p-4 transition-all ${
                  msg.approvalGate.status === 'pending'
                    ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                    : msg.approvalGate.status === 'approved'
                      ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20'
                      : 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
                }`}>
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    {msg.approvalGate.status === 'pending' ? (
                      <Shield className="w-5 h-5 text-amber-600" />
                    ) : msg.approvalGate.status === 'approved' ? (
                      <ShieldCheck className="w-5 h-5 text-green-600" />
                    ) : (
                      <ShieldX className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`text-sm font-semibold ${
                      msg.approvalGate.status === 'pending'
                        ? 'text-amber-700 dark:text-amber-400'
                        : msg.approvalGate.status === 'approved'
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}>
                      {msg.approvalGate.status === 'pending'
                        ? 'Approval Required'
                        : msg.approvalGate.status === 'approved'
                          ? 'Approved & Executed'
                          : 'Rejected'}
                    </span>
                  </div>

                  {/* Preview — what it wants to do */}
                  <p className="text-sm text-foreground mb-3">{msg.approvalGate.preview}</p>

                  {/* Result after approval/rejection */}
                  {msg.approvalGate.result && (
                    <div className={`text-sm px-3 py-2 rounded-lg mb-3 ${
                      msg.approvalGate.status === 'approved'
                        ? 'bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                        : 'bg-red-100/50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                    }`}>
                      {msg.approvalGate.result}
                    </div>
                  )}

                  {/* Action buttons — only when pending */}
                  {msg.approvalGate.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-9 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApproval(msg.id, msg.approvalGate!.toolCallId, true)}
                        disabled={approvingId === msg.approvalGate.toolCallId}
                      >
                        {approvingId === msg.approvalGate.toolCallId ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                        )}
                        Allow
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => handleApproval(msg.id, msg.approvalGate!.toolCallId, false)}
                        disabled={approvingId === msg.approvalGate.toolCallId}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Safety/failure status */}
              {msg.agentStatus === 'safety_stopped' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  Safety limit reached
                </div>
              )}
              {msg.agentStatus === 'failed' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 text-xs">
                  <XCircle className="w-3 h-3" />
                  Run failed
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the butler what to do…"
            className="flex-1 px-4 py-2.5 rounded-2xl border border-border bg-card text-sm outline-none focus:border-primary/50 focus:shadow-[0_0_0_2px_rgba(107,143,113,0.1)] transition-all"
            disabled={loading}
            autoComplete="off"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              input.trim()
                ? 'bg-primary text-primary-foreground shadow-sm hover:shadow'
                : 'text-muted-foreground/40'
            }`}
            aria-label="Send"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
