'use client';
import { useState, useEffect, useCallback } from 'react';
import { Brain, X, Loader2, RefreshCw, AlertTriangle, TrendingUp, Lightbulb, Flame, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Insight {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  priority: number;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, any> = {
  warning: AlertTriangle,
  pattern: TrendingUp,
  opportunity: Lightbulb,
  nudge: Brain,
  streak: Flame,
};

const TYPE_COLORS: Record<string, string> = {
  warning: 'text-red-500 bg-red-50 dark:bg-red-950/20',
  pattern: 'text-blue-500 bg-blue-50 dark:bg-blue-950/20',
  opportunity: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20',
  nudge: 'text-primary bg-primary/10',
  streak: 'text-orange-500 bg-orange-50 dark:bg-orange-950/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  health: '💪 Health',
  wealth: '💰 Wealth',
  relationship: '❤️ Relationship',
  productivity: '⚡ Productivity',
};

export function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch('/api/insights');
      if (res.ok) setInsights(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const generateInsights = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/insights', { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success(`Generated ${created.length} insights`);
        fetchInsights();
      } else {
        toast.error('Failed to generate insights');
      }
    } catch {
      toast.error('Failed');
    }
    setGenerating(false);
  };

  const dismissInsight = async (id: string) => {
    await fetch(`/api/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDismissed: true }),
    });
    setInsights(prev => prev.filter(i => i.id !== id));
  };

  const markRead = async (id: string) => {
    await fetch(`/api/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });
    setInsights(prev => prev.map(i => i.id === id ? { ...i, isRead: true } : i));
  };

  const unreadCount = insights.filter(i => !i.isRead).length;
  const activeInsights = insights.filter(i => !i.isDismissed);

  if (activeInsights.length === 0 && !generating) {
    return (
      <section className="game-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Jarvis Insights</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={generateInsights} disabled={generating}>
            {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Analyze my life
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">No active insights. Tap to have AI analyze patterns across your life data.</p>
      </section>
    );
  }

  return (
    <section className="game-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono text-primary tracking-widest uppercase">Jarvis Insights</span>
          {unreadCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-mono">{unreadCount}</span>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>
        <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2" onClick={generateInsights} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {generating && (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Analyzing patterns across your life data...</span>
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          {activeInsights.map((insight) => {
            const Icon = TYPE_ICONS[insight.type] || Brain;
            const colorClass = TYPE_COLORS[insight.type] || TYPE_COLORS.nudge;

            return (
              <div
                key={insight.id}
                className={`rounded-xl p-3 space-y-1.5 transition-all ${insight.isRead ? 'bg-muted/30' : 'bg-card border border-border'}`}
                style={!insight.isRead ? { boxShadow: 'var(--shadow-sm)' } : {}}
                onClick={() => !insight.isRead && markRead(insight.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-semibold">{insight.title}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[8px] text-muted-foreground font-mono">{CATEGORY_LABELS[insight.category] || insight.category}</span>
                    <button onClick={(e) => { e.stopPropagation(); dismissInsight(insight.id); }} className="p-0.5 rounded hover:bg-secondary">
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
