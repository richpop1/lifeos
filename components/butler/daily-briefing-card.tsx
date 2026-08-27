'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, RefreshCw, Zap, Calendar, Mail, Target,
  ChevronDown, ChevronUp, AlertTriangle, Wallet, Heart, Briefcase, Cake
} from 'lucide-react';

interface Props {
  onNavigate: (tab: any) => void;
  alterEgoName?: string | null;
}

interface BriefingData {
  events: any[];
  tasksDue: { id: string; title: string; priority: string; isNeedleMover: boolean; dueDate: string | null; pillar: string | null }[];
  habitsToday: { id: string; title: string; doneToday: boolean }[];
  goalUpdates: { id: string; title: string; progress: number; pillar: string | null }[];
  emailAlerts: { id: string; subject: string; from: string; action: string | null; unread: boolean }[];
  upcomingBirthdays?: { id: string; name: string; date: string; daysUntil: number; occasion: string }[];
}

const PILLAR_META: Record<string, { icon: any; label: string; color: string }> = {
  wealth: { icon: Wallet, label: 'Finance', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  health: { icon: Heart, label: 'Health', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  relationship: { icon: Heart, label: 'People', color: 'text-pink-600 bg-pink-50 border-pink-200' },
};

export function DailyBriefingCard({ onNavigate, alterEgoName }: Props) {
  const [briefingText, setBriefingText] = useState<string>('');
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/daily-briefing', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setBriefingText(json.briefingText || '');
        setBriefingData(json.briefingData || null);
      }
    } catch (e) {
      console.error('[BRIEFING] generate error:', e);
    } finally {
      setGenerating(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/daily-briefing');
      if (res.ok) {
        const json = await res.json();
        if (json.briefingText || json.briefingData) {
          setBriefingText(json.briefingText || '');
          setBriefingData(json.briefingData || null);
          setLoading(false);
          return;
        }
      }
      // No briefing yet today — generate one
      setLoading(false);
      await generate();
    } catch (e) {
      console.error('[BRIEFING] load error:', e);
      setLoading(false);
    }
  }, [generate]);

  useEffect(() => { load(); }, [load]);

  // ─── Derived: top 3 priorities ──────────────────────────────────
  const tasks = briefingData?.tasksDue || [];
  const topTasks = [...tasks]
    .sort((a, b) => {
      if (a.isNeedleMover !== b.isNeedleMover) return a.isNeedleMover ? -1 : 1;
      const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    })
    .slice(0, 3);

  const eventsCount = briefingData?.events?.length || 0;
  const emailsNeedingReply = (briefingData?.emailAlerts || []).filter(e => e.action === 'reply_needed').length;
  const unreadEmails = (briefingData?.emailAlerts || []).filter(e => e.unread).length;
  const habitsRemaining = (briefingData?.habitsToday || []).filter(h => !h.doneToday).length;
  const birthdaysThisWeek = briefingData?.upcomingBirthdays || [];

  // ─── Loading skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 animate-pulse">
        <div className="h-4 w-32 bg-primary/10 rounded mb-3" />
        <div className="h-3 w-full bg-muted rounded mb-2" />
        <div className="h-3 w-4/5 bg-muted rounded" />
      </div>
    );
  }

  const firstName = alterEgoName || null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-none">Butler Briefing</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Your day, prioritised</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors"
          title="Regenerate briefing"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-primary ${generating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button
          onClick={() => onNavigate('inbox')}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-card border border-border"
        >
          <Mail className="w-3 h-3 text-primary" />
          {emailsNeedingReply > 0
            ? <span className="font-medium text-primary">{emailsNeedingReply} need reply</span>
            : <span className="text-muted-foreground">{unreadEmails} unread</span>}
        </button>
        <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-card border border-border">
          <Calendar className="w-3 h-3 text-blue-500" />
          <span className="text-muted-foreground">{eventsCount} event{eventsCount !== 1 ? 's' : ''}</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-card border border-border">
          <Target className="w-3 h-3 text-orange-500" />
          <span className="text-muted-foreground">{tasks.length} due</span>
        </span>
        {habitsRemaining > 0 && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-card border border-border">
            <Zap className="w-3 h-3 text-yellow-500" />
            <span className="text-muted-foreground">{habitsRemaining} habit{habitsRemaining !== 1 ? 's' : ''} left</span>
          </span>
        )}
        {birthdaysThisWeek.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-pink-50 border border-pink-200 dark:bg-pink-900/20 dark:border-pink-800">
            <Cake className="w-3 h-3 text-pink-500" />
            <span className="text-pink-700 dark:text-pink-300">
              {birthdaysThisWeek.length === 1
                ? `${birthdaysThisWeek[0].name.split(' ')[0]}'s ${birthdaysThisWeek[0].occasion}${birthdaysThisWeek[0].daysUntil === 0 ? ' today!' : ` in ${birthdaysThisWeek[0].daysUntil}d`}`
                : `${birthdaysThisWeek.length} dates this week`}
            </span>
          </span>
        )}
      </div>

      {/* Top 3 priorities */}
      {topTasks.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Top priorities</p>
          {topTasks.map((t, i) => {
            const pillar = t.pillar ? PILLAR_META[t.pillar] : null;
            const overdue = t.dueDate && new Date(t.dueDate) < new Date();
            return (
              <div key={t.id} className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${t.isNeedleMover ? 'bg-yellow-100' : 'bg-primary/10'}`}>
                  {t.isNeedleMover
                    ? <Zap className="w-3 h-3 text-yellow-600" />
                    : <span className="text-[10px] font-bold text-primary">{i + 1}</span>}
                </div>
                <span className="text-sm flex-1 min-w-0 truncate">{t.title}</span>
                {overdue && (
                  <span className="flex items-center gap-0.5 text-[10px] text-red-500 flex-shrink-0">
                    <AlertTriangle className="w-3 h-3" /> overdue
                  </span>
                )}
                {pillar && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${pillar.color}`}>
                    {pillar.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI prose — collapsible */}
      {briefingText && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-primary/5 transition-colors"
          >
            <span className="text-xs font-medium text-primary flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {expanded ? 'Hide' : 'Read'} full briefing
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expanded && (
            <div className="px-4 pb-4 pt-1">
              <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                {briefingText}
              </div>
            </div>
          )}
        </div>
      )}

      {generating && !briefingText && (
        <div className="px-4 pb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Butler is reviewing your day…
        </div>
      )}
    </div>
  );
}
