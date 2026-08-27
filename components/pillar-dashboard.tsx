'use client';
import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Lightbulb, ChevronDown, ChevronUp, Plus, DollarSign, Heart, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScoreCard } from '@/components/score-card';
import { ScoreHistory } from '@/components/score-history';
import { ScoreUpdateModal } from '@/components/score-update-modal';

const BENCHMARK = 6;

const PILLAR_CONFIG = {
  wealth: {
    label: 'Wealth',
    icon: DollarSign,
    color: 'hsl(var(--wealth))',
    metrics: [
      { key: 'activeIncome', label: 'Active Income' },
      { key: 'passiveIncome', label: 'Passive Income' },
      { key: 'riskManagement', label: 'Risk Management' },
      { key: 'personalBudget', label: 'Personal Budget' },
    ],
  },
  health: {
    label: 'Health',
    icon: Heart,
    color: 'hsl(var(--health))',
    metrics: [
      { key: 'physical', label: 'Physical' },
      { key: 'emotional', label: 'Emotional' },
      { key: 'mental', label: 'Mental (Focus)' },
      { key: 'spiritual', label: 'Spiritual' },
    ],
  },
  relationship: {
    label: 'Relationships',
    icon: Users,
    color: 'hsl(var(--relationship))',
    metrics: [
      { key: 'partner', label: 'Partner' },
      { key: 'family', label: 'Family' },
      { key: 'friends', label: 'Friends' },
      { key: 'community', label: 'Community' },
    ],
  },
};

interface Props {
  scores: any[];
  onScoreAdded: () => void;
}

export function PillarDashboard({ scores, onScoreAdded }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const latest = useMemo(() => {
    if (!scores?.length) return null;
    return scores[scores.length - 1];
  }, [scores]);

  const previous = useMemo(() => {
    if ((scores?.length ?? 0) < 2) return null;
    return scores[(scores?.length ?? 0) - 2];
  }, [scores]);

  const lowestScores = useMemo(() => {
    if (!latest) return [];
    const allMetrics: { key: string; label: string; pillar: string; value: number }[] = [];
    Object.entries(PILLAR_CONFIG).forEach(([pillarKey, pillar]: [string, any]) => {
      (pillar.metrics ?? []).forEach((m: any) => {
        allMetrics.push({
          key: m.key,
          label: m.label,
          pillar: pillar.label,
          value: latest?.[m.key] ?? 5,
        });
      });
    });
    return allMetrics.sort((a: any, b: any) => (a?.value ?? 0) - (b?.value ?? 0)).slice(0, 5);
  }, [latest]);

  const getInsight = useMemo(() => {
    if (!lowestScores?.length) return null;
    const pillarsAffected = [...new Set((lowestScores ?? []).slice(0, 3).map((s: any) => s?.pillar))];
    if (pillarsAffected.includes('Health') && pillarsAffected.includes('Wealth')) {
      return 'Start a morning routine with exercise + income review — impacts both Health and Wealth scores simultaneously.';
    }
    if (pillarsAffected.includes('Relationships') && pillarsAffected.includes('Health')) {
      return 'Schedule active social meetups (hiking, gym buddy) — boosts both Relationship and Health pillars.';
    }
    if (pillarsAffected.includes('Wealth')) {
      return 'Focus on one income-generating project this week — passive income and active income both need attention.';
    }
    return 'Pick one low-scoring area and dedicate 30 minutes daily to improving it this week.';
  }, [lowestScores]);

  const pillarAvg = (pillarKey: string) => {
    if (!latest) return 0;
    const config = PILLAR_CONFIG[pillarKey as keyof typeof PILLAR_CONFIG];
    if (!config) return 0;
    const sum = (config.metrics ?? []).reduce((acc: number, m: any) => acc + (latest?.[m.key] ?? 0), 0);
    return sum / (config.metrics?.length ?? 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight">Life Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {latest ? `Last updated: ${new Date(latest.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No scores recorded yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide History' : 'Past Entries'}
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-1" /> Update Scores
          </Button>
        </div>
      </div>

      {/* Pillar Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(PILLAR_CONFIG).map(([key, pillar]: [string, any]) => {
          const Icon = pillar.icon;
          const avg = pillarAvg(key);
          const isExpanded = expanded === key;
          const prevAvg = previous
            ? (pillar.metrics ?? []).reduce((acc: number, m: any) => acc + (previous?.[m.key] ?? 0), 0) / (pillar.metrics?.length ?? 1)
            : null;
          const trend = prevAvg !== null ? avg - prevAvg : 0;

          return (
            <div
              key={key}
              className="bg-card rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
              style={{ boxShadow: 'var(--shadow-sm)' }}
              onClick={() => setExpanded(isExpanded ? null : key)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${pillar.color}15` }}>
                    <Icon className="w-4 h-4" style={{ color: pillar.color }} />
                  </div>
                  <span className="font-display font-semibold text-sm">{pillar.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {trend !== 0 && (
                    <span className={`flex items-center text-xs ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(trend).toFixed(1)}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Average</span>
                  <span className="font-mono font-semibold">{avg.toFixed(1)}/10</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(avg / 10) * 100}%`, backgroundColor: pillar.color }}
                  />
                </div>
              </div>

              {/* Expanded metrics */}
              {isExpanded && (
                <div className="mt-4 space-y-3 pt-3 border-t border-border">
                  {(pillar.metrics ?? []).map((m: any) => {
                    const val = latest?.[m.key] ?? 0;
                    const prevVal = previous?.[m.key] ?? null;
                    return (
                      <ScoreCard
                        key={m.key}
                        label={m.label}
                        value={val}
                        prevValue={prevVal}
                        color={pillar.color}
                        benchmark={BENCHMARK}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Insights Panel */}
      {latest && (
        <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h3 className="font-display font-semibold text-sm">Insights & Focus Areas</h3>
          </div>

          {/* Lowest scores */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Areas below benchmark ({BENCHMARK}/10):</p>
            <div className="flex flex-wrap gap-2">
              {(lowestScores ?? []).filter((s: any) => (s?.value ?? 10) < BENCHMARK).map((s: any) => (
                <div key={s?.key ?? ''} className="flex items-center gap-1.5 px-2.5 py-1 bg-destructive/10 text-destructive rounded-md text-xs font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {s?.label ?? ''} ({s?.value ?? 0}) — {s?.pillar ?? ''}
                </div>
              ))}
              {(lowestScores ?? []).filter((s: any) => (s?.value ?? 10) < BENCHMARK).length === 0 && (
                <span className="text-xs text-green-600">All scores at or above benchmark!</span>
              )}
            </div>
          </div>

          {/* Multi-impact suggestion */}
          {getInsight && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary font-bold">💡</span>
                {getInsight}
              </p>
            </div>
          )}

          {/* Latest note */}
          {latest?.note && (
            <div className="mt-3 p-3 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground mb-1">Latest reflection:</p>
              <p className="text-sm italic">"{latest.note}"</p>
            </div>
          )}
        </div>
      )}

      {/* Historical Chart */}
      {showHistory && <ScoreHistory scores={scores} />}

      {/* Score Update Modal */}
      {showAddModal && (
        <ScoreUpdateModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); onScoreAdded(); }}
        />
      )}
    </div>
  );
}
