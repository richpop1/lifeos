'use client';
import { useMemo } from 'react';
import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const METRICS = [
  { key: 'activeIncome', label: 'Active Income', pillar: 'wealth' },
  { key: 'passiveIncome', label: 'Passive Income', pillar: 'wealth' },
  { key: 'riskManagement', label: 'Risk Mgmt', pillar: 'wealth' },
  { key: 'personalBudget', label: 'Budget', pillar: 'wealth' },
  { key: 'physical', label: 'Physical', pillar: 'health' },
  { key: 'emotional', label: 'Emotional', pillar: 'health' },
  { key: 'mental', label: 'Focus', pillar: 'health' },
  { key: 'spiritual', label: 'Spiritual', pillar: 'health' },
  { key: 'partner', label: 'Partner', pillar: 'relationship' },
  { key: 'family', label: 'Family', pillar: 'relationship' },
  { key: 'friends', label: 'Friends', pillar: 'relationship' },
  { key: 'community', label: 'Community', pillar: 'relationship' },
];

const PILLAR_COLORS: Record<string, string> = {
  wealth: 'hsl(var(--wealth))',
  health: 'hsl(var(--health))',
  relationship: 'hsl(var(--relationship))',
};

const PILLAR_BG: Record<string, string> = {
  wealth: 'bg-emerald-50 dark:bg-emerald-950/30',
  health: 'bg-orange-50 dark:bg-orange-950/30',
  relationship: 'bg-pink-50 dark:bg-pink-950/30',
};

interface Props {
  scores: any[];
}

function ScoreBadge({ value, prevValue, pillar }: { value: number; prevValue: number | null; pillar: string }) {
  const diff = prevValue !== null ? value - prevValue : 0;
  const color = PILLAR_COLORS[pillar];
  const isBelowBench = value < 6;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`text-sm font-mono font-bold tabular-nums ${
          isBelowBench ? 'text-red-500' : ''
        }`}
        style={!isBelowBench ? { color } : undefined}
      >
        {value}
      </span>
      {prevValue !== null && diff !== 0 && (
        <span className={`flex items-center text-[10px] leading-none ${
          diff > 0 ? 'text-green-600' : 'text-red-500'
        }`}>
          {diff > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {Math.abs(diff)}
        </span>
      )}
    </div>
  );
}

export function ScoreHistory({ scores }: Props) {
  // Show newest first
  const sortedScores = useMemo(() => {
    return [...(scores ?? [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [scores]);

  // Build a lookup for previous entry per index (previous = next in sorted array since sorted desc)
  const getPrev = (idx: number) => {
    return idx < sortedScores.length - 1 ? sortedScores[idx + 1] : null;
  };

  if (!sortedScores.length) {
    return (
      <div className="bg-card rounded-xl p-6 text-center text-muted-foreground text-sm">
        No score entries yet. Start by updating your scores!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display font-semibold text-sm">Past Entries</h3>
      <div className="space-y-3">
        {sortedScores.map((entry: any, idx: number) => {
          const prev = getPrev(idx);
          const date = new Date(entry.date);
          const wealthAvg = (METRICS.filter(m => m.pillar === 'wealth').reduce((s, m) => s + (entry[m.key] ?? 0), 0) / 4);
          const healthAvg = (METRICS.filter(m => m.pillar === 'health').reduce((s, m) => s + (entry[m.key] ?? 0), 0) / 4);
          const relAvg = (METRICS.filter(m => m.pillar === 'relationship').reduce((s, m) => s + (entry[m.key] ?? 0), 0) / 4);
          const overallAvg = ((wealthAvg + healthAvg + relAvg) / 3);

          return (
            <div
              key={entry.id ?? idx}
              className="bg-card rounded-xl p-4 transition-all hover:shadow-md"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              {/* Date header + overall */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="font-display font-semibold text-sm">
                    {date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Overall: {overallAvg.toFixed(1)}
                </div>
              </div>

              {/* 3 pillar groups */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Wealth */}
                <div className={`rounded-lg p-3 ${PILLAR_BG.wealth}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold" style={{ color: PILLAR_COLORS.wealth }}>💰 Wealth</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">{wealthAvg.toFixed(1)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {METRICS.filter(m => m.pillar === 'wealth').map(m => (
                      <div key={m.key} className="text-center">
                        <p className="text-[10px] text-muted-foreground leading-tight mb-1 truncate">{m.label}</p>
                        <ScoreBadge
                          value={entry[m.key] ?? 0}
                          prevValue={prev ? (prev[m.key] ?? null) : null}
                          pillar="wealth"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Health */}
                <div className={`rounded-lg p-3 ${PILLAR_BG.health}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold" style={{ color: PILLAR_COLORS.health }}>❤️ Health</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">{healthAvg.toFixed(1)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {METRICS.filter(m => m.pillar === 'health').map(m => (
                      <div key={m.key} className="text-center">
                        <p className="text-[10px] text-muted-foreground leading-tight mb-1 truncate">{m.label}</p>
                        <ScoreBadge
                          value={entry[m.key] ?? 0}
                          prevValue={prev ? (prev[m.key] ?? null) : null}
                          pillar="health"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Relationships */}
                <div className={`rounded-lg p-3 ${PILLAR_BG.relationship}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold" style={{ color: PILLAR_COLORS.relationship }}>👥 Relationships</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">{relAvg.toFixed(1)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {METRICS.filter(m => m.pillar === 'relationship').map(m => (
                      <div key={m.key} className="text-center">
                        <p className="text-[10px] text-muted-foreground leading-tight mb-1 truncate">{m.label}</p>
                        <ScoreBadge
                          value={entry[m.key] ?? 0}
                          prevValue={prev ? (prev[m.key] ?? null) : null}
                          pillar="relationship"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reflection note */}
              {entry.note && (
                <div className="mt-3 p-2.5 rounded-lg bg-secondary/50">
                  <p className="text-xs italic text-muted-foreground leading-relaxed">
                    "{entry.note}"
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
