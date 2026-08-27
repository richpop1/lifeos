'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Inbox, Circle, CheckCircle2, Zap, Flame,
  Plus, X, ArrowRight, ArrowLeft,
  Mail, Send, Loader2, Star,
  Settings, Brain, Reply, ChevronDown,
  MailOpen, Sparkles,
  Trash2, Archive, ListTodo, MessageSquare, Play,
  Shield, Eye, Wand2, Check,
  Copy, Filter, RefreshCw, ChevronRight,
  Target, Bookmark, Clock, MailCheck,
  AlertTriangle, ChevronLeft, ShieldBan, ThumbsUp, ThumbsDown, MessageCircle, ArrowRightLeft, DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { EmailSetup } from '@/components/email-setup';
import { EmailCompose } from '@/components/email-compose';
import { TaskDetail, TaskFormModal, URGENCY_CONFIG as SHARED_URGENCY } from '@/components/task-components';

const PILLAR_COLORS: Record<string, string> = { wealth: '#4ADE80', health: '#FB923C', relationship: '#F472B6' };
const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Urgent' }, high: { color: '#F97316', label: 'High' },
  medium: { color: '#F59E0B', label: 'Med' }, low: { color: '#22C55E', label: 'Low' },
};
const STAT_LABELS: Record<string, string> = {
  activeIncome: 'Active Income', passiveIncome: 'Passive Income', riskManagement: 'Risk Mgmt', personalBudget: 'Budget',
  physical: 'Physical', emotional: 'Emotional', mental: 'Focus', spiritual: 'Spiritual',
  partner: 'Partner', family: 'Family', friends: 'Friends', community: 'Community',
};
const STAT_TO_PILLAR: Record<string, string> = {
  activeIncome: 'wealth', passiveIncome: 'wealth', riskManagement: 'wealth', personalBudget: 'wealth',
  physical: 'health', emotional: 'health', mental: 'health', spiritual: 'health',
  partner: 'relationship', family: 'relationship', friends: 'relationship', community: 'relationship',
};

const ACTION_FILTERS = [
  { key: 'all', label: 'All', icon: Mail },
  { key: 'read', label: 'Read', icon: Eye },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'trash', label: 'Trash', icon: Trash2 },
] as const;

type ViewMode = 'inbox' | 'tasks';
type ActionFilter = typeof ACTION_FILTERS[number]['key'];

interface Props { scores: any[]; onNavigate: (tab: any) => void; }

export function InboxView({ scores, onNavigate }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [showCompose, setShowCompose] = useState<any>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [todayStr, setTodayStr] = useState('1970-01-01');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [northStar, setNorthStar] = useState('');
  const [prioritizing, setPrioritizing] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [actioningEmail, setActioningEmail] = useState<string | null>(null);
  const [showTaskLinkModal, setShowTaskLinkModal] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setMounted(true); setTodayStr(new Date().toISOString().split('T')[0]); }, []);

  const fetchTasks = useCallback(async () => { try { const r = await fetch('/api/tasks'); if (r.ok) setTasks(await r.json().catch(() => [])); } catch {} }, []);
  const fetchGoals = useCallback(async () => { try { const r = await fetch('/api/goals'); if (r.ok) setGoals(await r.json().catch(() => [])); } catch {} }, []);
  const fetchHabits = useCallback(async () => { try { const r = await fetch('/api/habits'); if (r.ok) setHabits(await r.json().catch(() => [])); } catch {} }, []);
  const fetchEmailAccounts = useCallback(async () => { try { const r = await fetch('/api/email/accounts'); if (r.ok) setEmailAccounts(await r.json().catch(() => [])); } catch {} }, []);
  const loadEmails = useCallback(async (skipCache = false) => {
    // Show cached data immediately (stale-while-revalidate)
    if (!skipCache) {
      try {
        const cached = sessionStorage.getItem('inbox_emails');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - (parsed._ts || 0) < 10 * 60 * 1000) {
            setEmails(parsed.emails || []);
            setUnreadCount(parsed.unreadCount || 0);
          }
        }
      } catch {}
    }
    // Background refresh
    try {
      const r = await fetch('/api/email/list?folder=ALL&limit=500');
      if (r.ok) {
        const d = await r.json();
        setEmails(d.emails || []);
        setUnreadCount(d.unreadCount || 0);
        try { sessionStorage.setItem('inbox_emails', JSON.stringify({ emails: d.emails || [], unreadCount: d.unreadCount || 0, _ts: Date.now() })); } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => { fetchTasks(); fetchGoals(); fetchHabits(); fetchEmailAccounts(); loadEmails(); }, [fetchTasks, fetchGoals, fetchHabits, fetchEmailAccounts, loadEmails]);

  // Listen for deep-link from task → source email
  useEffect(() => {
    const handler = (e: Event) => {
      const emailId = (e as CustomEvent).detail?.emailId;
      if (!emailId) return;
      // Find email in current list and open it
      const found = emails.find((em: any) => em.id === emailId);
      if (found) { openEmail(found); return; }
      // If not in list, fetch directly
      fetch(`/api/email/${emailId}`).then(r => r.ok ? r.json() : null).then(data => {
        if (data) { setSelectedEmail(data); setDrawerOpen(true); }
      }).catch(() => {});
    };
    window.addEventListener('inbox:openEmail', handler);
    // Listen for background autopilot completion
    const autopilotHandler = () => { loadEmails(true); fetchTasks(); };
    window.addEventListener('autopilot:done', autopilotHandler);
    return () => { window.removeEventListener('inbox:openEmail', handler); window.removeEventListener('autopilot:done', autopilotHandler); };
  }, [emails, loadEmails, fetchTasks]);
  useEffect(() => { fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => { if (p?.northStar) setNorthStar(p.northStar); }).catch(() => {}); }, []);

  // Keyboard shortcuts for email actions (1-5)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedEmail) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const key = e.key;
      if (key === '1') { e.preventDefault(); replyToEmail(selectedEmail); }
      else if (key === '2') { e.preventDefault(); archiveEmail(selectedEmail.id); }
      else if (key === '3') { e.preventDefault(); deleteEmail(selectedEmail.id); }
      else if (key === '4') { e.preventDefault(); setShowTaskLinkModal(selectedEmail); }
      else if (key === '5') {
        e.preventDefault();
        const act = selectedEmail.aiAction;
        if (act === 'reply_needed') replyToEmail(selectedEmail);
        else if (act === 'auto_reply' && selectedEmail.aiDraftReply) sendQuickReply(selectedEmail);
        else if (act === 'add_task') setShowTaskLinkModal(selectedEmail);
      }
      else if (key === 's' || key === 'S') { e.preventDefault(); spamEmail(selectedEmail.id); }
      else if (key === 'Escape') { e.preventDefault(); closeEmailDetail(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEmail]);

  // Resize iframe to content
  const adjustIframeHeight = useCallback(() => {
    if (iframeRef.current) {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc?.body) {
          iframeRef.current.style.height = Math.max(200, Math.min(doc.body.scrollHeight + 20, 600)) + 'px';
        }
      } catch {}
    }
  }, []);

  // Sync — fetch recent emails from all accounts (NOT full re-download)
  const runFullSync = async () => {
    if (!emailAccounts.length) { setShowEmailSetup(true); return; }
    setFullSyncing(true);
    let totalNew = 0;
    try {
      for (const acc of emailAccounts) {
        try {
          const r = await fetch('/api/email/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: acc.id, limit: 50 }),
          });
          if (r.ok) {
            const d = await r.json();
            totalNew += d.fetched || 0;
          }
        } catch {}
      }
      await loadEmails(true);
      toast.success(totalNew > 0 ? `${totalNew} new emails` : 'Already up to date', { icon: '📬' });
    } catch { toast.error('Sync failed'); }
    setFullSyncing(false);
  };

  // AI Autopilot
  const runAutopilot = async () => {
    if (!emailAccounts.length) { setShowEmailSetup(true); return; }
    setAutopilotRunning(true);
    try {
      const res = await fetch('/api/email/autopilot', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        if (data.newEmails > 0) parts.push(`${data.newEmails} new`);
        if (data.triaged > 0) parts.push(`${data.triaged} organized`);
        if (data.markedTrash > 0) parts.push(`${data.markedTrash} → trash`);
        if (data.autoArchived > 0) parts.push(`${data.autoArchived} archived`);
        if (data.tasksCreated > 0) parts.push(`${data.tasksCreated} tasks`);
        toast.success(parts.length > 0 ? parts.join(' \u00b7 ') : 'All caught up!', { icon: '\u2728', duration: 5000 });
        await loadEmails(true);
        if (data.tasksCreated > 0) fetchTasks();
      } else toast.error(data.error || 'Failed');
    } catch { toast.error('Connection failed'); }
    setAutopilotRunning(false);
  };

  // Email actions
  const archiveEmail = async (id: string) => {
    setActioningEmail(id);
    await fetch(`/api/email/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: true, aiAction: 'archive', userAction: 'archive' }) }).catch(() => {});
    setEmails(p => p.map(e => e.id === id ? { ...e, isRead: true, aiAction: 'archive' } : e));
    // Auto-open next email in list
    if (selectedEmail?.id === id) {
      const currentIdx = filteredEmails.findIndex(e => e.id === id);
      const nextEmail = filteredEmails[currentIdx + 1] || filteredEmails[currentIdx - 1];
      if (nextEmail && nextEmail.id !== id) openEmail(nextEmail);
      else { setSelectedEmail(null); setDrawerOpen(false); }
    }
    setActioningEmail(null);
    toast.success('Archived');
  };
  const deleteEmail = async (id: string) => {
    setActioningEmail(id);
    // Find next email before removing from list
    const currentIdx = filteredEmails.findIndex(e => e.id === id);
    const nextEmail = filteredEmails[currentIdx + 1] || filteredEmails[currentIdx - 1];
    // Soft-delete: PATCH sets userAction + IMAP sync, DELETE soft-marks in DB
    await fetch(`/api/email/${id}`, { method: 'DELETE' }).catch(() => {});
    setEmails(p => p.filter(e => e.id !== id));
    if (selectedEmail?.id === id) {
      if (nextEmail && nextEmail.id !== id) openEmail(nextEmail);
      else { setSelectedEmail(null); setDrawerOpen(false); }
    }
    setActioningEmail(null);
    toast.success('Deleted');
  };
  const spamEmail = async (id: string) => {
    setActioningEmail(id);
    const currentIdx = filteredEmails.findIndex(e => e.id === id);
    const nextEmail = filteredEmails[currentIdx + 1] || filteredEmails[currentIdx - 1];
    await fetch(`/api/email/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userAction: 'spam', aiAction: 'delete' }) }).catch(() => {});
    setEmails(p => p.filter(e => e.id !== id));
    if (selectedEmail?.id === id) {
      if (nextEmail && nextEmail.id !== id) openEmail(nextEmail);
      else { setSelectedEmail(null); setDrawerOpen(false); }
    }
    setActioningEmail(null);
    toast.success('Marked as spam');
  };
  const reclassifyEmail = async (emailId: string, newAction: string) => {
    setActioningEmail(emailId);
    try {
      await fetch(`/api/email/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiAction: newAction, userAction: 'reclassified' }),
      });
      setEmails(p => p.map(e => e.id === emailId ? { ...e, aiAction: newAction } : e));
      // Also update selected if open
      if (selectedEmail?.id === emailId) setSelectedEmail((p: any) => p ? { ...p, aiAction: newAction } : p);
      const labels: Record<string, string> = { read_later: 'Read', add_task: 'Task', reply_needed: 'Reply', archive: 'Done' };
      toast.success(`Moved to ${labels[newAction] || newAction}`);
    } catch { toast.error('Failed to reclassify'); }
    setActioningEmail(null);
  };

  const createTaskFromEmail = async (email: any, goalId?: string) => {
    const title = email.aiActionDetail || `Follow up: ${email.subject}`;
    const payload: any = { title, isNeedleMover: email.aiUrgency === 'critical' || email.aiUrgency === 'high', sourceEmailId: email.id };
    if (goalId) payload.goalId = goalId;
    if (email.aiCategory === 'finance') payload.pillar = 'wealth';
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    if (res?.ok) {
      toast.success('Task created & linked');
      await fetch(`/api/email/${email.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiAction: 'archive', isRead: true, userAction: 'task' }) }).catch(() => {});
      setEmails(p => p.map(e => e.id === email.id ? { ...e, aiAction: 'archive', isRead: true } : e));
      fetchTasks();
    }
  };
  const sendQuickReply = async (email: any, presetBody?: string) => {
    const replyBody = presetBody || email.aiDraftReply;
    if (!replyBody) { toast.error('No reply available'); return; }
    const acc = emailAccounts.find((a: any) => a.id === email.accountId);
    if (!acc) { toast.error('Account not found'); return; }
    setActioningEmail(email.id);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: acc.id, to: email.fromAddress, subject: `Re: ${email.subject}`, body: replyBody, inReplyTo: email.messageId }),
      });
      if (res.ok) {
        toast.success(presetBody ? 'Reply sent!' : 'Quick reply sent!');
        await fetch(`/api/email/${email.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiAction: 'archive', isRead: true, userAction: 'reply' }) }).catch(() => {});
        setEmails(p => p.map(e => e.id === email.id ? { ...e, aiAction: 'archive', isRead: true } : e));
        // Auto-open next
        const currentIdx = filteredEmails.findIndex(e => e.id === email.id);
        const nextEmail = filteredEmails[currentIdx + 1] || filteredEmails[currentIdx - 1];
        if (selectedEmail?.id === email.id) {
          if (nextEmail && nextEmail.id !== email.id) openEmail(nextEmail);
          else { setSelectedEmail(null); setDrawerOpen(false); }
        }
      } else toast.error('Send failed');
    } catch { toast.error('Send failed'); }
    setActioningEmail(null);
  };
  const openEmail = async (email: any) => {
    setSelectedEmail(email); setLoadingEmail(true); setDrawerOpen(true);
    try { const r = await fetch(`/api/email/${email.id}`); if (r.ok) { const f = await r.json(); setSelectedEmail(f); setEmails(p => p.map(e => e.id === email.id ? { ...e, isRead: true } : e)); setUnreadCount(p => email.isRead ? p : Math.max(0, p - 1)); } } catch {}
    setLoadingEmail(false);
  };
  const closeEmailDetail = () => { setSelectedEmail(null); setDrawerOpen(false); };
  const replyToEmail = (email: any) => {
    const acc = emailAccounts.find((a: any) => a.id === email.accountId);
    if (acc) setShowCompose({ accountId: acc.id, accountEmail: acc.email, replyTo: { to: email.fromAddress, subject: email.subject, messageId: email.messageId, fromName: email.fromName, draftBody: email.aiDraftReply } });
  };
  const toggleTask = async (task: any) => { await fetch(`/api/tasks/${task?.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: task?.status === 'done' ? 'todo' : 'done' }) }).catch(() => {}); fetchTasks(); };
  const toggleHabit = async (id: string) => { await fetch('/api/habits/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habitId: id, date: new Date().toISOString().split('T')[0] }) }).catch(() => {}); fetchHabits(); };

  const aiPrioritize = async () => { setPrioritizing(true); try { const r = await fetch('/api/tasks/ai-prioritize', { method: 'POST' }); if (r.ok) { const d = await r.json(); toast.success(`Prioritized ${d.prioritized} tasks`); fetchTasks(); } } catch {} setPrioritizing(false); };
  const [bulkProcessing, setBulkProcessing] = useState<string | null>(null);
  const bulkAction = async (action: string, ids: string[]) => {
    const label = action === 'delete' ? 'Delete' : 'Archive';
    if (!confirm(`${label} ${ids.length} emails? This cannot be undone.`)) return;
    setBulkProcessing(action);
    try {
      const r = await fetch('/api/email/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }) });
      if (!r.ok) throw new Error('Bulk action failed');
      setEmails(prev => prev.filter(e => !ids.includes(e.id)));
      if (selectedEmail && ids.includes(selectedEmail.id)) { setSelectedEmail(null); setDrawerOpen(false); }
      toast.success(`${action === 'delete' ? 'Deleted' : 'Archived'} ${ids.length} emails`);
    } catch { toast.error('Bulk action failed'); } finally { setBulkProcessing(null); }
  };

  // Derived data
  const activeTasks = useMemo(() => (tasks || []).filter((t: any) => t.status !== 'done' && t.triageStatus !== 'pending' && t.triageStatus !== 'dismissed').sort((a: any, b: any) => {
    const u: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (a.isNeedleMover && !b.isNeedleMover) return -1; if (!a.isNeedleMover && b.isNeedleMover) return 1;
    return (u[a.aiUrgency || 'medium'] ?? 2) - (u[b.aiUrgency || 'medium'] ?? 2);
  }), [tasks]);
  const pendingTriageTasks = useMemo(() => (tasks || []).filter((t: any) => t.triageStatus === 'pending'), [tasks]);
  const undoneHabits = useMemo(() => (habits || []).filter((h: any) => !(h.logs || []).some((l: any) => new Date(l.date).toISOString().split('T')[0] === todayStr)), [habits, todayStr]);
  const inboxEmails = useMemo(() => emails.filter((e: any) => e.folder !== 'SENT'), [emails]);
  const accountFiltered = useMemo(() => accountFilter === 'all' ? inboxEmails : inboxEmails.filter(e => e.accountId === accountFilter), [inboxEmails, accountFilter]);
  // Effective action: userAction overrides aiAction (user decisions are final)
  const getEffectiveAction = useCallback((e: any) => {
    if (e.userAction === 'archive' || e.userAction === 'reply' || e.userAction === 'task') return 'archive';
    if (e.userAction === 'delete' || e.userAction === 'spam') return 'delete';
    return e.aiAction || null;
  }, []);
  const filteredEmails = useMemo(() => {
    switch (actionFilter) {
      case 'read': return accountFiltered.filter(e => { const a = getEffectiveAction(e); return a === 'read_later' || a === 'auto_reply' || !a; });
      case 'archive': return accountFiltered.filter(e => getEffectiveAction(e) === 'archive');
      case 'trash': return accountFiltered.filter(e => getEffectiveAction(e) === 'delete');
      default: return accountFiltered.filter(e => { const a = getEffectiveAction(e); return a !== 'delete' && a !== 'archive'; });
    }
  }, [accountFiltered, actionFilter, getEffectiveAction]);
  const actionCounts = useMemo(() => {
    const c = { all: 0, read: 0, archive: 0, trash: 0 };
    for (const e of accountFiltered) {
      const a = getEffectiveAction(e);
      if (a === 'archive') c.archive++;
      else if (a === 'delete') c.trash++;
      else if (a === 'read_later' || a === 'auto_reply' || !a) { c.read++; c.all++; }
      else c.all++;
    }
    return c;
  }, [accountFiltered, getEffectiveAction]);
  const insights = useMemo(() => { const l = scores?.[scores?.length - 1] ?? null; if (!l) return []; return Object.entries(STAT_LABELS).filter(([k]) => ((l as any)[k] ?? 5) < 6 && !dismissedIds.has(`insight-${k}`)).map(([k, lab]) => ({ key: k, label: lab, value: (l as any)[k] ?? 5, pillar: STAT_TO_PILLAR[k] })); }, [scores, dismissedIds]);

  const fmt = (d: string) => { if (!mounted) return ''; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d`; return new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }); };
  const si = (e: any) => (e.fromName || e.fromAddress || '?').charAt(0).toUpperCase();
  const sc = (e: any) => { const h = (e.fromAddress || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0); return ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9'][h % 9]; };
  const cleanBody = (text: string | null | undefined): string => {
    if (!text) return '';
    return text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/[\s]+/g, ' ').trim();
  };

  // Build safe HTML for iframe srcdoc
  const buildSafeHtml = (email: any): string => {
    if (email.bodyHtml) {
      // Wrap in a safe container with base styles
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;word-break:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto}a{color:#6366f1}table{max-width:100%!important;width:auto!important}pre,code{white-space:pre-wrap;word-break:break-all}</style></head><body>${email.bodyHtml}</body></html>`;
    }
    if (email.bodyText) {
      const escaped = cleanBody(email.bodyText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#374151}</style></head><body>${escaped}</body></html>`;
    }
    return `<!DOCTYPE html><html><head><style>body{margin:0;padding:40px 12px;font-family:sans-serif;color:#9ca3af;text-align:center;font-size:13px}</style></head><body>Content loads on next AI Sync</body></html>`;
  };

  // ════════════════════════════════════
  // RENDER
  // ════════════════════════════════════
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight flex items-center gap-1.5">
            <Inbox className="w-4 h-4 text-primary" /> Inbox
          </h1>
          {unreadCount > 0 && <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
        </div>
        <div className="flex items-center gap-1">
          {emailAccounts.length > 0 && (
            <>
              <button onClick={runFullSync} disabled={fullSyncing || autopilotRunning}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
                title="Download new emails">
                {fullSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {fullSyncing ? 'Syncing...' : 'Sync'}
              </button>
              <button onClick={runAutopilot} disabled={autopilotRunning || fullSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                title="AI sorts, trashes spam, archives low-priority, creates tasks">
                {autopilotRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {autopilotRunning ? 'Clearing...' : 'AI Copilot'}
              </button>
            </>
          )}
          <button onClick={() => setShowEmailSetup(!showEmailSetup)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Settings className="w-4 h-4" /></button>
          <button onClick={() => setShowAddTask(true)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      {showEmailSetup && <EmailSetup accounts={emailAccounts} onRefresh={() => { fetchEmailAccounts(); loadEmails(); }} onClose={() => setShowEmailSetup(false)} />}
      {showCompose && <EmailCompose accountId={showCompose.accountId} accountEmail={showCompose.accountEmail} replyTo={showCompose.replyTo} onClose={() => setShowCompose(null)} onSent={() => loadEmails()} />}

      {/* Account filter chips */}
      {emailAccounts.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button onClick={() => setAccountFilter('all')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${accountFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'}`}>All inboxes</button>
          {emailAccounts.map((acc: any) => (
            <button key={acc.id} onClick={() => setAccountFilter(acc.id)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all truncate max-w-[140px] ${accountFilter === acc.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'}`}>
              {acc.label || acc.email.split('@')[0]}
            </button>
          ))}
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-secondary/40">
        {([{ k: 'inbox' as ViewMode, l: 'Mail', c: actionCounts.all }, { k: 'tasks' as ViewMode, l: 'Tasks', c: pendingTriageTasks.length > 0 ? pendingTriageTasks.length : activeTasks.length }]).map(t => (
          <button key={t.k} onClick={() => setViewMode(t.k)} className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all ${
            viewMode === t.k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.l}{t.c > 0 && <span className={`ml-1 text-[9px] font-mono px-1 py-0.5 rounded-full ${
              viewMode === t.k ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>{t.c}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════ INBOX VIEW ═══════════ */}
      {viewMode === 'inbox' && (
        <div>
          {/* Action filter bar */}
          <div className="flex gap-1 overflow-x-auto pb-1.5 -mx-1 px-1 scrollbar-hide">
            {ACTION_FILTERS.map(f => {
              const count = actionCounts[f.key]; const Icon = f.icon;
              return (
                <button key={f.key} onClick={() => setActionFilter(f.key)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    actionFilter === f.key ? 'bg-foreground text-background shadow-sm' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}>
                  <Icon className="w-3 h-3" /> {f.label}
                  {count > 0 && <span className={`text-[8px] font-mono px-1 py-0.5 rounded-full ${actionFilter === f.key ? 'bg-background/20' : 'bg-muted'}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Compose + bulk */}
          {emailAccounts.length > 0 && (
            <div className="flex items-center justify-between mb-1.5">
              <button onClick={() => setShowCompose({ accountId: emailAccounts[0].id, accountEmail: emailAccounts[0].email })}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"><Send className="w-3 h-3" /> Compose</button>
              {actionFilter === 'trash' && filteredEmails.length > 0 && (
                <button disabled={!!bulkProcessing} onClick={() => bulkAction('delete', filteredEmails.map(e => e.id))} className="text-[10px] text-red-400 hover:text-red-500 disabled:opacity-50">{bulkProcessing === 'delete' ? 'Emptying…' : `Empty trash (${filteredEmails.length})`}</button>
              )}
            </div>
          )}

          {/* ── DESKTOP SPLIT PANE (md+) ── */}
          <div className="hidden md:flex gap-3" style={{ minHeight: '400px' }}>
            {/* LEFT: Email list */}
            <div className={`${selectedEmail ? 'w-[38%]' : 'w-full'} transition-all duration-200`}>
              {emailAccounts.length === 0 ? (
                <EmptyConnect onSetup={() => setShowEmailSetup(true)} />
              ) : filteredEmails.length === 0 ? (
                <EmptyInbox actionFilter={actionFilter} onReset={() => setActionFilter('all')} />
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden overflow-y-auto" style={{ maxHeight: '70vh', boxShadow: 'var(--shadow-sm)' }}>
                  {filteredEmails.map((email, idx) => (
                    <EmailRowCompact key={email.id} email={email} isLast={idx === filteredEmails.length - 1}
                      isSelected={selectedEmail?.id === email.id}
                      onOpen={openEmail} fmt={fmt} si={si} sc={sc}
                      cleanBody={cleanBody} actioning={actioningEmail === email.id}
                      accountLabel={emailAccounts.length > 1 ? (email.account?.label || email.account?.email?.split('@')[1]) : undefined}
                      onArchive={archiveEmail} onDelete={deleteEmail} onSpam={spamEmail}
                      onQuickReply={sendQuickReply} onCreateTask={(e) => createTaskFromEmail(e)}
                      onReply={replyToEmail}
                      onReclassify={reclassifyEmail} currentFilter={actionFilter} />
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: Email detail pane (desktop) */}
            {selectedEmail && (
              <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-md)' }}>
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: sc(selectedEmail) }}>{si(selectedEmail)}</div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">{selectedEmail.subject}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{selectedEmail.fromName || selectedEmail.fromAddress} \u00b7 {fmt(selectedEmail.date)}</p>
                    </div>
                  </div>
                  <button onClick={closeEmailDetail} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>

                {/* Rich email body (iframe) */}
                <div className="flex-1 overflow-y-auto">
                  {loadingEmail ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      sandbox="allow-same-origin allow-popups"
                      srcDoc={buildSafeHtml(selectedEmail)}
                      onLoad={adjustIframeHeight}
                      className="w-full border-0"
                      style={{ minHeight: '200px', height: '400px' }}
                      title="Email content"
                    />
                  )}
                </div>

                {/* ── AI SUMMARY + ACTIONS at BOTTOM ── */}
                <EmailAIBar email={selectedEmail}
                  onReply={() => replyToEmail(selectedEmail)}
                  onQuickReply={() => sendQuickReply(selectedEmail)}
                  onArchive={() => archiveEmail(selectedEmail.id)}
                  onDelete={() => deleteEmail(selectedEmail.id)}
                  onSpam={() => spamEmail(selectedEmail.id)}
                  onCreateTask={() => setShowTaskLinkModal(selectedEmail)}
                  onEmailUpdate={(updated) => setSelectedEmail(updated)}
                  onPresetReply={(body) => sendQuickReply(selectedEmail, body)}
                  onNavigate={onNavigate}
                />
              </div>
            )}
          </div>

          {/* ── MOBILE LIST (< md) ── */}
          <div className="md:hidden">
            {emailAccounts.length === 0 ? (
              <EmptyConnect onSetup={() => setShowEmailSetup(true)} />
            ) : filteredEmails.length === 0 ? (
              <EmptyInbox actionFilter={actionFilter} onReset={() => setActionFilter('all')} />
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
                {filteredEmails.map((email, idx) => (
                  <EmailRowCompact key={email.id} email={email} isLast={idx === filteredEmails.length - 1}
                    isSelected={false} onOpen={openEmail} fmt={fmt} si={si} sc={sc}
                    cleanBody={cleanBody} actioning={actioningEmail === email.id}
                    accountLabel={emailAccounts.length > 1 ? (email.account?.label || email.account?.email?.split('@')[1]) : undefined}
                    onArchive={archiveEmail} onDelete={deleteEmail} onSpam={spamEmail}
                    onQuickReply={sendQuickReply} onCreateTask={(e) => createTaskFromEmail(e)}
                    onReply={replyToEmail}
                    onReclassify={reclassifyEmail} currentFilter={actionFilter} />
                ))}
              </div>
            )}
          </div>

          {/* ── MOBILE BOTTOM DRAWER ── */}
          {drawerOpen && selectedEmail && (
            <div className="md:hidden fixed inset-0 z-50">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50" onClick={closeEmailDetail} />
              {/* Drawer */}
              <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl flex flex-col"
                style={{ maxHeight: '88vh', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)' }}>
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-border" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: sc(selectedEmail) }}>{si(selectedEmail)}</div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">{selectedEmail.subject}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{selectedEmail.fromName || selectedEmail.fromAddress} \u00b7 {fmt(selectedEmail.date)}</p>
                    </div>
                  </div>
                  <button onClick={closeEmailDetail} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>

                {/* Email body */}
                <div className="flex-1 overflow-y-auto">
                  {loadingEmail ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <iframe
                      sandbox="allow-same-origin allow-popups"
                      srcDoc={buildSafeHtml(selectedEmail)}
                      className="w-full border-0"
                      style={{ minHeight: '250px', height: '50vh' }}
                      title="Email content"
                    />
                  )}
                </div>

                {/* ── AI SUMMARY + ACTIONS at BOTTOM ── */}
                <EmailAIBar email={selectedEmail}
                  onReply={() => replyToEmail(selectedEmail)}
                  onQuickReply={() => sendQuickReply(selectedEmail)}
                  onArchive={() => archiveEmail(selectedEmail.id)}
                  onDelete={() => deleteEmail(selectedEmail.id)}
                  onSpam={() => spamEmail(selectedEmail.id)}
                  onCreateTask={() => setShowTaskLinkModal(selectedEmail)}
                  onEmailUpdate={(updated) => setSelectedEmail(updated)}
                  onPresetReply={(body) => sendQuickReply(selectedEmail, body)}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          )}

          {/* Habits due */}
          {undoneHabits.length > 0 && !drawerOpen && (
            <div className="space-y-1 pt-2">
              <p className="text-[9px] font-semibold uppercase text-muted-foreground flex items-center gap-1"><Flame className="w-3 h-3" /> Habits due</p>
              {undoneHabits.map((h: any) => (
                <div key={h.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/30 transition-colors">
                  <button onClick={() => toggleHabit(h.id)} className="text-muted-foreground hover:text-orange-400"><Flame className="w-3.5 h-3.5" /></button>
                  <p className="text-[12px] font-medium flex-1">{h.title}</p>
                  {h.pillar && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PILLAR_COLORS[h.pillar] ?? '#666' }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TASKS VIEW ═══ */}
      {viewMode === 'tasks' && (
        <TaskTriageView
          tasks={tasks}
          goals={goals}
          habits={habits}
          todayStr={todayStr}
          northStar={northStar}
          onRefresh={() => { fetchTasks(); fetchHabits(); }}
          onPrioritize={aiPrioritize}
          prioritizing={prioritizing}
          onToggleHabit={toggleHabit}
        />
      )}

      {/* Task link modal */}
      {showTaskLinkModal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowTaskLinkModal(null)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-sm p-4 pb-6 sm:pb-4" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-display font-bold">Create task from email</h3>
              <button onClick={() => setShowTaskLinkModal(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 truncate">From: {showTaskLinkModal.subject}</p>
            <p className="text-[12px] font-medium mb-2">{showTaskLinkModal.aiActionDetail || `Follow up: ${showTaskLinkModal.subject}`}</p>
            {goals.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Link to your goal (Start with Why)</p>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {goals.filter((g: any) => g.status === 'active').map((g: any) => (
                    <button key={g.id} onClick={() => { createTaskFromEmail(showTaskLinkModal, g.id); setShowTaskLinkModal(null); }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-secondary/50 transition-colors border border-border">
                      {g.pillar && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PILLAR_COLORS[g.pillar] ?? '#666' }} />}
                      <span className="text-[11px] font-medium truncate flex-1">{g.title}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => { createTaskFromEmail(showTaskLinkModal); setShowTaskLinkModal(null); }}
              className="w-full py-2 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all">
              {goals.length > 0 ? 'Create without goal link' : 'Create task'}
            </button>
          </div>
        </div>
      )}

      {/* Add Task modal (shared rich version) */}
      {showAddTask && (
        <TaskFormModal
          goals={goals}
          northStar={northStar}
          onClose={() => setShowAddTask(false)}
          onSave={() => fetchTasks()}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════

// AI summary + action bar pinned at bottom of email detail
const QUICK_REPLY_PRESETS = [
  { label: 'Noted', body: 'Noted, thank you.', icon: ThumbsUp },
  { label: 'Confirmed', body: 'Confirmed, thanks for letting me know.', icon: Check },
  { label: 'Thanks', body: 'Thank you, appreciate it!', icon: MessageCircle },
  { label: 'Not interested', body: 'Thank you for reaching out, but I\'m not interested at this time.', icon: ThumbsDown },
];

function EmailAIBar({ email, onReply, onQuickReply, onArchive, onDelete, onSpam, onCreateTask, onEmailUpdate, onPresetReply, onNavigate }: {
  email: any; onReply: () => void; onQuickReply: () => void;
  onArchive: () => void; onDelete: () => void; onSpam: () => void; onCreateTask: () => void;
  onEmailUpdate?: (updated: any) => void; onPresetReply?: (body: string) => void;
  onNavigate?: (tab: any) => void;
}) {
  const [summarizing, setSummarizing] = useState(false);
  const [localSummary, setLocalSummary] = useState<any>(null);
  const hasTriggered = useRef(false);

  // Auto-generate summary when email has no AI analysis
  useEffect(() => {
    if (email?.id && !email.aiSummary && !localSummary && !summarizing && !hasTriggered.current && email.bodyText) {
      hasTriggered.current = true;
      setSummarizing(true);
      fetch('/api/email/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setLocalSummary(data);
            if (onEmailUpdate) onEmailUpdate({ ...email, aiSummary: data.summary, aiUrgency: data.urgency, aiCategory: data.category, aiAction: data.action, aiDraftReply: data.draftReply, northStarAlign: data.northStarAlign });
          }
        })
        .catch(() => {})
        .finally(() => setSummarizing(false));
    }
  }, [email?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset trigger when email changes
  useEffect(() => { hasTriggered.current = false; setLocalSummary(null); }, [email?.id]);

  const summary = email.aiSummary || localSummary?.summary;
  const urgencyKey = email.aiUrgency || localSummary?.urgency;
  const category = email.aiCategory || localSummary?.category;
  const align = email.northStarAlign || localSummary?.northStarAlign;
  const draftReply = email.aiDraftReply || localSummary?.draftReply;
  const action = email.aiAction || localSummary?.action;
  const urgency = urgencyKey ? URGENCY_CONFIG[urgencyKey] : null;

  // Parse multiline summary into parts
  const summaryParts = summary?.split('\n').filter(Boolean) || [];
  const mainSummary = summaryParts[0] || '';
  const pendingLine = summaryParts.find((l: string) => l.startsWith('⏳'));
  const recLine = summaryParts.find((l: string) => l.startsWith('💡'));

  return (
    <div className="border-t border-border flex-shrink-0 bg-card">
      {/* AI Summary strip */}
      {summarizing ? (
        <div className="px-3 py-3 bg-indigo-50/60 dark:bg-indigo-950/15 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin flex-shrink-0" />
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400">Analyzing email thread…</span>
        </div>
      ) : summary ? (
        <div className="px-3 py-2.5 bg-indigo-50/60 dark:bg-indigo-950/15">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-[11px] text-indigo-700 dark:text-indigo-400 leading-snug font-medium">{mainSummary}</p>
              {pendingLine && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">{pendingLine}</p>
              )}
              {recLine && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-snug">{recLine}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {urgency && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: urgency.color + '15', color: urgency.color }}>{urgency.label}</span>}
                {category && <span className="text-[8px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded-full">{category}</span>}
                {align && align >= 5 && <span className="text-[8px] text-amber-500 flex items-center gap-0.5"><Star className="w-2 h-2" /> {align}/10</span>}
              </div>
            </div>
          </div>
        </div>
      ) : !email.bodyText ? (
        <div className="px-3 py-2 bg-secondary/30 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground">AI summary available after email content loads</span>
        </div>
      ) : null}

      {/* AI Draft Reply preview */}
      {draftReply && draftReply !== 'null' && (
        <div className="px-3 py-2 bg-purple-50/50 dark:bg-purple-950/10 border-t border-border/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Wand2 className="w-3 h-3 text-purple-500" />
            <span className="text-[9px] font-semibold text-purple-700 dark:text-purple-400">AI Draft Reply</span>
            <button onClick={() => { navigator.clipboard.writeText(draftReply); toast.success('Copied'); }} className="ml-auto text-[8px] text-purple-500 flex items-center gap-0.5"><Copy className="w-2.5 h-2.5" /> Copy</button>
          </div>
          <p className="text-[11px] text-foreground/70 line-clamp-3">{draftReply}</p>
        </div>
      )}

      {/* Action buttons - always visible, thumb-friendly */}
      <div className="px-3 py-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {action === 'reply_needed' && (
          <button onClick={onReply} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 transition-colors flex-shrink-0">
            <Reply className="w-3.5 h-3.5" /> Reply <kbd className="ml-1 px-1 py-0.5 rounded bg-blue-700/50 text-[8px] font-mono">5</kbd>
          </button>
        )}
        {action === 'auto_reply' && draftReply && (
          <button onClick={onQuickReply} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-[11px] font-semibold hover:bg-purple-700 transition-colors flex-shrink-0">
            <Send className="w-3.5 h-3.5" /> Send Reply <kbd className="ml-1 px-1 py-0.5 rounded bg-purple-700/50 text-[8px] font-mono">5</kbd>
          </button>
        )}
        {action === 'add_task' && (
          <button onClick={onCreateTask} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 transition-colors flex-shrink-0">
            <ListTodo className="w-3.5 h-3.5" /> Create Task <kbd className="ml-1 px-1 py-0.5 rounded bg-amber-600/50 text-[8px] font-mono">5</kbd>
          </button>
        )}
        {/* Secondary actions — always available */}
        <button onClick={onReply} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors flex-shrink-0">
          <Reply className="w-3 h-3" /><span className="hidden sm:inline">Reply</span><kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[8px] font-mono text-muted-foreground/60">1</kbd>
        </button>
        <button onClick={onArchive} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors flex-shrink-0">
          <Archive className="w-3 h-3" /><span className="hidden sm:inline">Archive</span><kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[8px] font-mono text-muted-foreground/60">2</kbd>
        </button>
        <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex-shrink-0">
          <Trash2 className="w-3 h-3" /><span className="hidden sm:inline">Delete</span><kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[8px] font-mono text-red-300/60">3</kbd>
        </button>
        <button onClick={onCreateTask} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors flex-shrink-0">
          <ListTodo className="w-3 h-3" /><span className="hidden sm:inline">Task</span><kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[8px] font-mono text-muted-foreground/60">4</kbd>
        </button>
        <button onClick={onSpam} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors flex-shrink-0">
          <ShieldBan className="w-3 h-3" /><span className="hidden sm:inline">Spam</span>
        </button>
        <button onClick={async () => {
          try {
            const sender = email.fromName || email.fromAddress || '';
            const sub = email.subject || '';
            const dateStr = email.date ? new Date(email.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            // Quick-create transaction from email
            const res = await fetch('/api/transactions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: 0, type: 'expense', category: 'Other', note: `${sender}: ${sub}`.substring(0, 200), date: dateStr }),
            });
            if (res.ok) {
              toast.success('Transaction created — edit amount in Finance tab', { duration: 4000 });
              if (onNavigate) onNavigate('finance');
            } else toast.error('Failed to create transaction');
          } catch { toast.error('Failed'); }
        }} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[10px] font-medium text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors flex-shrink-0">
          <DollarSign className="w-3 h-3" /><span className="hidden sm:inline">Finance</span>
        </button>
      </div>

      {/* Quick Preset Replies */}
      {onPresetReply && (action === 'reply_needed' || action === 'auto_reply') && (
        <div className="px-3 pb-2.5 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground mb-1.5 mt-2">Quick Reply</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLY_PRESETS.map(preset => (
              <button key={preset.label} onClick={() => onPresetReply(preset.body)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/60 text-[10px] font-medium text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors">
                <preset.icon className="w-3 h-3" /> {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact email row with inline quick actions
function EmailRowCompact({ email, isLast, isSelected, onOpen, fmt, si, sc, cleanBody, actioning, accountLabel, onArchive, onDelete, onSpam, onQuickReply, onCreateTask, onReply, onReclassify, currentFilter }: {
  email: any; isLast: boolean; isSelected: boolean;
  onOpen: (e: any) => void;
  fmt: (d: string) => string; si: (e: any) => string; sc: (e: any) => string;
  cleanBody: (t: string | null | undefined) => string;
  actioning: boolean; accountLabel?: string;
  onArchive?: (id: string) => void; onDelete?: (id: string) => void; onSpam?: (id: string) => void;
  onQuickReply?: (e: any) => void; onCreateTask?: (e: any) => void; onReply?: (e: any) => void;
  onReclassify?: (id: string, newAction: string) => void;
  currentFilter?: string;
}) {
  const urgency = email.aiUrgency ? URGENCY_CONFIG[email.aiUrgency] : null;
  const action = email.aiAction;
  const previewText = email.aiSummary || cleanBody(email.bodyText)?.substring(0, 80) || '';

  const actionIcon = useMemo(() => {
    switch (action) {
      case 'reply_needed': return { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500' };
      case 'auto_reply': return { icon: Send, color: 'text-purple-500', bg: 'bg-purple-500' };
      case 'add_task': return { icon: ListTodo, color: 'text-amber-500', bg: 'bg-amber-500' };
      case 'delete': return { icon: Trash2, color: 'text-red-400', bg: 'bg-red-400' };
      case 'archive': return { icon: Archive, color: 'text-gray-400', bg: 'bg-gray-400' };
      default: return null;
    }
  }, [action]);

  return (
    <div className={`transition-colors ${
      isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-secondary/20 border-l-2 border-l-transparent'
    } ${!email.isRead ? 'bg-blue-50/30 dark:bg-blue-950/5' : ''} ${!isLast ? 'border-b border-border/40' : ''}`}>
      <div onClick={() => onOpen(email)} className="flex items-start gap-2 p-2.5 cursor-pointer">
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: sc(email) }}>{si(email)}</div>
          {email.threadCount > 1 && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center border border-card">{email.threadCount}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-[11px] truncate ${(email.threadHasUnread || !email.isRead) ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
              {email.threadCount > 1
                ? (email.threadParticipants || [email.fromName || email.fromAddress?.split('@')[0]]).slice(0, 3).join(', ')
                : (email.fromName || email.fromAddress?.split('@')[0])}
            </span>
            {accountLabel && <span className="text-[7px] text-muted-foreground bg-secondary/60 px-1 py-0.5 rounded flex-shrink-0">{accountLabel}</span>}
            <span className="text-[8px] text-muted-foreground flex-shrink-0 ml-auto">{fmt(email.date)}</span>
          </div>
          <p className={`text-[11px] truncate leading-snug ${(email.threadHasUnread || !email.isRead) ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>{email.subject}</p>
          <div className="flex items-center gap-1 mt-0.5">
            {actionIcon && <actionIcon.icon className={`w-2.5 h-2.5 flex-shrink-0 ${actionIcon.color}`} />}
            {urgency && urgency.label !== 'Low' && (
              <span className="text-[7px] font-bold px-1 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: urgency.color + '15', color: urgency.color }}>{urgency.label}</span>
            )}
            {previewText && <p className="text-[9px] text-muted-foreground truncate flex-1">{previewText}</p>}
          </div>
        </div>
        {actioning && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0 mt-1" />}
      </div>
      {/* Quick action buttons — context-aware per tab */}
      <div className="flex items-center gap-1 px-2.5 pb-2 -mt-0.5">
        <div className="w-7 flex-shrink-0" />
        {currentFilter === 'all' ? (
          /* ── ALL TAB: Jarvis-style inline actions ── */
          <>
            {action === 'add_task' && onCreateTask && (
              <>
                <button onClick={(e) => { e.stopPropagation(); onCreateTask(email); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Check className="w-2.5 h-2.5" /> Accept
                </button>
                {onReclassify && (
                  <button onClick={(e) => { e.stopPropagation(); onReclassify(email.id, 'archive'); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium text-red-500/70 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                    <X className="w-2.5 h-2.5" /> Dismiss
                  </button>
                )}
              </>
            )}
            {action === 'reply_needed' && onReply && (
              <button onClick={(e) => { e.stopPropagation(); onReply(email); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                <Reply className="w-2.5 h-2.5" /> Reply
              </button>
            )}
            {action === 'auto_reply' && email.aiDraftReply && onQuickReply && (
              <button onClick={(e) => { e.stopPropagation(); onQuickReply(email); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors">
                <Send className="w-2.5 h-2.5" /> Send Reply
              </button>
            )}
            {onArchive && action !== 'archive' && action !== 'delete' && action !== 'add_task' && (
              <button onClick={(e) => { e.stopPropagation(); onArchive(email.id); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 text-muted-foreground text-[9px] font-medium hover:bg-secondary transition-colors">
                <Archive className="w-2.5 h-2.5" /> Archive
              </button>
            )}
            {onDelete && action !== 'archive' && action !== 'delete' && action !== 'add_task' && action !== 'reply_needed' && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-400/70 text-[9px] font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <Trash2 className="w-2.5 h-2.5" /> Trash
              </button>
            )}
          </>
        ) : currentFilter === 'read' ? (
          /* ── READ TAB: minimal actions ── */
          <>
            {action === 'auto_reply' && email.aiDraftReply && onQuickReply && (
              <button onClick={(e) => { e.stopPropagation(); onQuickReply(email); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors">
                <Send className="w-2.5 h-2.5" /> Send Reply
              </button>
            )}
            {onArchive && (
              <button onClick={(e) => { e.stopPropagation(); onArchive(email.id); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 text-muted-foreground text-[9px] font-medium hover:bg-secondary transition-colors">
                <Archive className="w-2.5 h-2.5" /> Archive
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-400/70 text-[9px] font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <Trash2 className="w-2.5 h-2.5" /> Trash
              </button>
            )}
          </>
        ) : currentFilter === 'archive' ? (
          /* ── ARCHIVE TAB: restore or trash ── */
          <>
            {onReclassify && (
              <button onClick={(e) => { e.stopPropagation(); onReclassify(email.id, 'read_later'); }}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-medium text-muted-foreground hover:bg-secondary/80 transition-colors">
                <ArrowRightLeft className="w-2.5 h-2.5" /> Restore
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-400/70 text-[9px] font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <Trash2 className="w-2.5 h-2.5" /> Trash
              </button>
            )}
          </>
        ) : currentFilter === 'trash' ? (
          /* ── TRASH TAB: restore only ── */
          <>
            {onReclassify && (
              <button onClick={(e) => { e.stopPropagation(); onReclassify(email.id, 'read_later'); }}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-medium text-muted-foreground hover:bg-secondary/80 transition-colors">
                <ArrowRightLeft className="w-2.5 h-2.5" /> Restore
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// Empty states
function EmptyConnect({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="text-center py-10">
      <Mail className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
      <p className="text-sm font-medium">Connect your email</p>
      <p className="text-[11px] text-muted-foreground mt-1 mb-3">See and manage all emails here</p>
      <Button variant="outline" size="sm" onClick={onSetup}><Plus className="w-3 h-3 mr-1" /> Connect</Button>
    </div>
  );
}
function EmptyInbox({ actionFilter, onReset }: { actionFilter: string; onReset: () => void }) {
  return (
    <div className="text-center py-8">
      <MailCheck className="w-8 h-8 text-green-400/50 mx-auto mb-2" />
      <p className="text-sm font-medium text-muted-foreground">
        {actionFilter === 'all' ? 'Inbox zero \u2014 you\u2019re clear!' : `No ${ACTION_FILTERS.find(f => f.key === actionFilter)?.label.toLowerCase()} emails`}
      </p>
      {actionFilter !== 'all' && <button onClick={onReset} className="text-[10px] text-primary mt-1">Show all</button>}
    </div>
  );
}

// ═══ TASK TRIAGE VIEW ═══
function TaskTriageView({ tasks, goals, habits, todayStr, northStar, onRefresh, onPrioritize, prioritizing, onToggleHabit }: {
  tasks: any[]; goals: any[]; habits: any[]; todayStr: string; northStar: string;
  onRefresh: () => void; onPrioritize: () => void; prioritizing: boolean; onToggleHabit: (id: string) => void;
}) {
  const [triaging, setTriaging] = useState(false);
  const [triageTasks, setTriageTasks] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [loadingTriage, setLoadingTriage] = useState(true);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'needle' | 'done'>('all');
  const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchTriage = useCallback(async () => {
    try {
      const r = await fetch('/api/tasks/triage');
      if (r.ok) setTriageTasks(await r.json());
    } catch {}
    setLoadingTriage(false);
  }, []);

  useEffect(() => { fetchTriage(); }, [fetchTriage]);

  const handleTriage = async (id: string, action: 'accept' | 'dismiss', edits?: any) => {
    setTriaging(true);
    try {
      const actions = [{ id, action, ...(edits ? { edits } : {}) }];
      const r = await fetch('/api/tasks/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actions }) });
      if (r.ok) {
        setTriageTasks(prev => prev.filter(t => t.id !== id));
        toast.success(action === 'accept' ? 'Task accepted' : 'Task dismissed');
        onRefresh();
      }
    } catch { toast.error('Failed'); }
    setTriaging(false);
  };

  const handleAcceptAll = async () => {
    if (triageTasks.length === 0) return;
    setTriaging(true);
    try {
      const actions = triageTasks.map(t => ({ id: t.id, action: 'accept' as const }));
      const r = await fetch('/api/tasks/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actions }) });
      if (r.ok) {
        const d = await r.json();
        setTriageTasks([]);
        toast.success(`Accepted ${d.accepted} tasks`);
        onRefresh();
      }
    } catch { toast.error('Failed'); }
    setTriaging(false);
  };

  const handleEditAccept = async (id: string) => {
    if (!editTitle.trim()) return;
    await handleTriage(id, 'accept', { title: editTitle.trim() });
    setEditingId(null);
    setEditTitle('');
  };

  const resolveTask = async (taskId: string, resolution: string) => {
    try {
      const r = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, status: 'done' }),
      });
      if (r.ok) {
        toast.success(resolution === 'completed' ? 'Done!' : `Resolved: ${resolution}`);
        onRefresh();
      }
    } catch { toast.error('Failed'); }
    setResolvingId(null);
  };

  const filteredTasks = useMemo(() => {
    const active = (tasks || []).filter((t: any) => t.triageStatus !== 'pending' && t.triageStatus !== 'dismissed');
    if (filter === 'all') return active.filter((t: any) => t.status !== 'done');
    if (filter === 'urgent') return active.filter((t: any) => t.status !== 'done' && (t.aiUrgency === 'critical' || t.aiUrgency === 'high'));
    if (filter === 'needle') return active.filter((t: any) => t.status !== 'done' && t.isNeedleMover);
    if (filter === 'done') return active.filter((t: any) => t.status === 'done');
    return active;
  }, [tasks, filter]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a: any, b: any) => {
      const u: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (a.isNeedleMover && !b.isNeedleMover) return -1;
      if (!a.isNeedleMover && b.isNeedleMover) return 1;
      return (u[a.aiUrgency || 'medium'] ?? 2) - (u[b.aiUrgency || 'medium'] ?? 2);
    });
  }, [filteredTasks]);

  // Group tasks by goal
  const activeGoals = goals.filter(g => g.status === 'active');
  const goalGrouped = useMemo(() => {
    const linked = activeGoals.map(g => ({
      goal: g,
      tasks: sortedTasks.filter(t => t.goalId === g.id),
    })).filter(g => g.tasks.length > 0);
    const unlinked = sortedTasks.filter(t => !t.goalId);
    return { linked, unlinked };
  }, [sortedTasks, activeGoals]);

  const undoneHabits = (habits || []).filter((h: any) => !(h.logs || []).some((l: any) => new Date(l.date).toISOString().split('T')[0] === todayStr));

  // Task detail drill-in
  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        goals={goals}
        onBack={() => { setSelectedTask(null); onRefresh(); }}
        onUpdate={(t: any) => setSelectedTask(t)}
      />
    );
  }

  const toggleCollapse = (goalId: string) => {
    setCollapsedGoals(prev => {
      const next = new Set(prev);
      next.has(goalId) ? next.delete(goalId) : next.add(goalId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Filter + Prioritize bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {(['all', 'urgent', 'needle', 'done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] rounded-md font-medium transition-colors ${
                filter === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}>
              {f === 'needle' ? '⚡ Needle' : f === 'urgent' ? '🔴 Urgent' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={onPrioritize} disabled={prioritizing} className="text-[9px] text-primary font-medium flex items-center gap-0.5 disabled:opacity-50">
          {prioritizing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Brain className="w-2.5 h-2.5" />} Prioritize
        </button>
      </div>

      {/* ── Triage Queue ── */}
      {(loadingTriage || triageTasks.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Wand2 className="w-3 h-3 text-indigo-400" /> Jarvis Suggestions
              {triageTasks.length > 0 && <span className="text-[9px] font-mono bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">{triageTasks.length}</span>}
            </p>
            {triageTasks.length > 1 && (
              <button onClick={handleAcceptAll} disabled={triaging}
                className="text-[9px] font-medium text-primary flex items-center gap-0.5 hover:underline disabled:opacity-50">
                <Check className="w-2.5 h-2.5" /> Accept All
              </button>
            )}
          </div>
          {loadingTriage ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-1.5">
              {triageTasks.map((task: any) => (
                <div key={task.id} className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/20" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  {editingId === task.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-[12px] h-7 flex-1" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleEditAccept(task.id); if (e.key === 'Escape') { setEditingId(null); setEditTitle(''); } }} />
                      <button onClick={() => handleEditAccept(task.id)} className="p-1 text-primary hover:bg-primary/10 rounded"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setEditingId(null); setEditTitle(''); }} className="p-1 text-muted-foreground hover:bg-secondary rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium">{task.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {task.aiUrgency && URGENCY_CONFIG[task.aiUrgency] && (
                              <span className="text-[8px] font-mono px-1 py-0.5 rounded-full"
                                style={{ backgroundColor: URGENCY_CONFIG[task.aiUrgency].color + '12', color: URGENCY_CONFIG[task.aiUrgency].color }}>
                                {URGENCY_CONFIG[task.aiUrgency].label}
                              </span>
                            )}
                            {task.goal && <span className="text-[8px] text-primary/70 flex items-center gap-0.5"><Target className="w-2 h-2" /> {task.goal.title}</span>}
                            {task.pillar && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PILLAR_COLORS[task.pillar] ?? '#666' }} />}
                          </div>
                          {task.sourceEmail && (
                            <button onClick={() => window.dispatchEvent(new CustomEvent('navigate:email', { detail: { emailId: task.sourceEmailId } }))}
                              className="flex items-center gap-1 mt-1 text-[9px] text-indigo-500 hover:text-indigo-700 hover:underline transition-colors truncate max-w-full">
                              <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{task.sourceEmail.subject || 'View email'}</span>
                            </button>
                          )}
                          {task.aiRecommendation && <p className="text-[9px] text-indigo-500 mt-0.5 truncate">→ {task.aiRecommendation}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-2 ml-5">
                        <button onClick={() => handleTriage(task.id, 'accept')} disabled={triaging}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                          <Check className="w-3 h-3" /> Accept
                        </button>
                        <button onClick={() => { setEditingId(task.id); setEditTitle(task.title); }} disabled={triaging}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-secondary/60 text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                          Edit
                        </button>
                        <button onClick={() => handleTriage(task.id, 'dismiss')} disabled={triaging}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium text-red-500/70 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50">
                          <X className="w-3 h-3" /> Dismiss
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Active Tasks (goal-grouped) ── */}
      <div>
        <p className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1 mb-1.5"><ListTodo className="w-3 h-3" /> {filter === 'done' ? 'Completed' : 'Active'} Tasks <span className="text-[9px] font-mono bg-muted px-1 py-0.5 rounded">{sortedTasks.length}</span></p>

        {sortedTasks.length === 0 ? (
          <div className="text-center py-4"><CheckCircle2 className="w-6 h-6 text-primary/30 mx-auto mb-1" /><p className="text-[11px] text-muted-foreground">{filter === 'done' ? 'No completed tasks.' : 'All clear! No active tasks.'}</p></div>
        ) : (
          <div className="space-y-3">
            {/* Goal-grouped tasks */}
            {goalGrouped.linked.map(({ goal, tasks: gTasks }) => {
              const isCollapsed = collapsedGoals.has(goal.id);
              return (
                <div key={goal.id}>
                  <button onClick={() => toggleCollapse(goal.id)} className="flex items-center gap-1.5 mb-1 text-[10px] font-medium text-muted-foreground hover:text-foreground w-full">
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <Target className="w-3 h-3" style={{ color: PILLAR_COLORS[goal.pillar] ?? '#6B8F71' }} />
                    <span style={{ color: PILLAR_COLORS[goal.pillar] }}>{goal.title}</span>
                    <span className="text-[9px] px-1 py-0.5 bg-secondary rounded">w{goal.weight}</span>
                    <span className="text-[9px] text-muted-foreground">{gTasks.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1 ml-4">
                      {gTasks.map((task: any) => (
                        <InboxTaskRow key={task.id} task={task} goals={goals}
                          onToggle={() => { fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: task.status === 'done' ? 'todo' : 'done' }) }).then(() => onRefresh()).catch(() => {}); }}
                          onClick={() => setSelectedTask(task)}
                          resolvingId={resolvingId} setResolvingId={setResolvingId} resolveTask={resolveTask}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unlinked tasks */}
            {goalGrouped.unlinked.length > 0 && (
              <div>
                {goalGrouped.linked.length > 0 && (
                  <p className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1"><Circle className="w-3 h-3" /> Unlinked</p>
                )}
                <div className="space-y-1">
                  {goalGrouped.unlinked.map((task: any) => (
                    <InboxTaskRow key={task.id} task={task} goals={goals}
                      onToggle={() => { fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: task.status === 'done' ? 'todo' : 'done' }) }).then(() => onRefresh()).catch(() => {}); }}
                      onClick={() => setSelectedTask(task)}
                      resolvingId={resolvingId} setResolvingId={setResolvingId} resolveTask={resolveTask}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Habits Due ── */}
      {undoneHabits.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1 mb-1.5"><Flame className="w-3 h-3" /> Habits Due</p>
          <div className="space-y-1">
            {undoneHabits.map((h: any) => (
              <div key={h.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/30 transition-colors">
                <button onClick={() => onToggleHabit(h.id)} className="text-muted-foreground hover:text-orange-400"><Flame className="w-3.5 h-3.5" /></button>
                <p className="text-[12px] font-medium flex-1">{h.title}</p>
                {h.pillar && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PILLAR_COLORS[h.pillar] ?? '#666' }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Unified Task Row with resolution quick-action ──
function InboxTaskRow({ task, goals, onToggle, onClick, resolvingId, setResolvingId, resolveTask }: {
  task: any; goals: any[]; onToggle: () => void; onClick: () => void;
  resolvingId: string | null; setResolvingId: (id: string | null) => void;
  resolveTask: (taskId: string, resolution: string) => void;
}) {
  const u = task.aiUrgency ? URGENCY_CONFIG[task.aiUrgency] : null;
  const subtasks = (task.subtasks as any[]) || [];
  const doneSubtasks = subtasks.filter((s: any) => s.done).length;
  const linkedGoal = task.goal || goals?.find((g: any) => g.id === task.goalId);
  const showResolve = resolvingId === task.id;

  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 p-2.5 rounded-xl bg-card hover:bg-secondary/30 transition-colors ${task.status === 'done' ? 'opacity-50' : ''}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="text-muted-foreground hover:text-primary flex-shrink-0">
          {task.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <div className="flex items-center gap-1">
            <p className={`text-[12px] font-medium truncate ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</p>
            {task.isNeedleMover && <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {u && <span className="text-[8px] font-mono px-1 py-0.5 rounded-full" style={{ backgroundColor: u.color + '12', color: u.color }}>{u.label}</span>}
            {subtasks.length > 0 && <span className="text-[8px] text-muted-foreground flex items-center gap-0.5"><ListTodo className="w-2.5 h-2.5" />{doneSubtasks}/{subtasks.length}</span>}
            {task.dueDate && <span className="text-[8px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(task.dueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
            {task.resolution && <span className="text-[8px] font-mono px-1 py-0.5 rounded-full bg-secondary text-muted-foreground">{task.resolution}</span>}
          </div>
          {task.sourceEmailId && task.sourceEmail && (
            <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('navigate:email', { detail: { emailId: task.sourceEmailId } })); }}
              className="flex items-center gap-1 mt-1 text-[9px] text-indigo-500 hover:text-indigo-700 hover:underline transition-colors truncate max-w-full">
              <Mail className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{task.sourceEmail.subject || 'View email'}</span>
            </button>
          )}
          {task.aiRecommendation && <p className="text-[9px] text-indigo-500 mt-0.5 truncate">→ {task.aiRecommendation}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {task.pillar && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PILLAR_COLORS[task.pillar] ?? '#666' }} />}
          {/* Resolution quick-action toggle */}
          {task.status !== 'done' && (
            <button onClick={(e) => { e.stopPropagation(); setResolvingId(showResolve ? null : task.id); }}
              className="p-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Quick resolve">
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resolution quick-action popup */}
      {showResolve && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-card rounded-xl p-2 border border-border min-w-[180px]" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1.5 px-1">Quick Resolve</p>
          {[
            { key: 'completed', label: '✅ Done', color: 'text-primary' },
            { key: 'delegated', label: '🤝 Delegated', color: 'text-blue-600' },
            { key: 'deferred', label: '⏸️ Deferred', color: 'text-amber-600' },
            { key: 'wont_do', label: "⏭️ Won't do", color: 'text-gray-500' },
            { key: 'irrelevant', label: '🗑️ Not relevant', color: 'text-red-400' },
          ].map(opt => (
            <button key={opt.key} onClick={() => resolveTask(task.id, opt.key)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium hover:bg-secondary/60 transition-colors ${opt.color}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}