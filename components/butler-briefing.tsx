'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Zap, TrendingUp, Loader2, RefreshCw,
  ChevronDown, CheckCircle2, Clock, Mail, Users, Wallet,
  Target, Flame, ArrowRight
} from 'lucide-react';

interface AttentionItem {
  type: string;
  title: string;
  detail: string;
  id?: string;
  severity: 'high' | 'medium';
}

interface PlayItem {
  type: string;
  title: string;
  detail?: string;
  id?: string;
}

interface Momentum {
  tasksCompletedToday: number;
  tasksPendingToday: number;
  habitsDoneToday: number;
  habitsTotal: number;
  bestStreak: number;
  bestStreakHabit: string;
  goalsProgress: { id: string; title: string; progress: number; target?: number; current?: number; unit?: string }[];
  scoreChange: { current: number; previous: number; delta: number } | null;
}

interface ButlerData {
  attention: AttentionItem[];
  play: PlayItem[];
  momentum: Momentum;
}

const ICON_MAP: Record<string, any> = {
  overdue_task: Clock,
  budget_alert: Wallet,
  email_reply: Mail,
  overdue_contact: Users,
};

export function ButlerBriefing() {
  const [data, setData] = useState<ButlerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/butler');
      if (r.ok) setData(await r.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  if (loading) {
    return (
      <section className="game-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading briefing...</span>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { attention, play, momentum } = data;
  const hasAttention = attention.length > 0;
  const hasPlay = play.length > 0;

  return (
    <section className="space-y-2">
      {/* ═══ 🔴 NEEDS ATTENTION ═══ */}
      {hasAttention && (
        <div className="game-card p-4 sm:p-5 border-l-[3px] border-l-red-400">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="font-display font-bold text-sm">Needs Attention</h3>
              <span className="text-[10px] font-mono text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
                {attention.length}
              </span>
            </div>
            <button onClick={fetchBriefing} className="text-[10px] text-muted-foreground hover:text-primary">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            {attention.map((item, i) => {
              const Icon = ICON_MAP[item.type] || AlertTriangle;
              return (
                <div key={i} className={`flex items-start gap-2.5 p-2 rounded-lg ${
                  item.severity === 'high' ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-secondary/30'
                }`}>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                    item.severity === 'high' ? 'text-red-500' : 'text-amber-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-snug truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 🟡 TODAY'S PLAY ═══ */}
      {hasPlay && (
        <div className="game-card p-4 sm:p-5 border-l-[3px] border-l-amber-400">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="font-display font-bold text-sm">Today's Play</h3>
          </div>
          <div className="space-y-1">
            {play.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-secondary/30">
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
                  {item.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 🟢 MOMENTUM ═══ */}
      <div className="game-card p-4 sm:p-5 border-l-[3px] border-l-emerald-400">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display font-bold text-sm">Momentum</h3>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-lg font-bold font-mono text-primary">{momentum.tasksCompletedToday}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Done today</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-lg font-bold font-mono">
                  {momentum.habitsDoneToday}/{momentum.habitsTotal}
                </p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Habits</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-center gap-0.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <p className="text-lg font-bold font-mono">{momentum.bestStreak}</p>
                </div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Best streak</p>
              </div>
            </div>

            {/* Goals progress */}
            {momentum.goalsProgress.length > 0 && (
              <div className="space-y-1.5">
                {momentum.goalsProgress.slice(0, 3).map(g => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Target className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] flex-1 truncate">{g.title}</span>
                    {g.target && g.unit ? (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {g.unit === '$' ? `$${(g.current || 0).toLocaleString()}/$${g.target.toLocaleString()}` : `${g.current || 0}/${g.target}${g.unit}`}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground">{g.progress}%</span>
                    )}
                    <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(g.progress, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Score change */}
            {momentum.scoreChange && momentum.scoreChange.current > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Life Score: <strong>{momentum.scoreChange.current}</strong></span>
                {momentum.scoreChange.delta !== 0 && (
                  <span className={momentum.scoreChange.delta > 0 ? 'text-emerald-500' : 'text-red-400'}>
                    {momentum.scoreChange.delta > 0 ? '+' : ''}{momentum.scoreChange.delta}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
