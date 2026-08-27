'use client';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  label: string;
  value: number;
  prevValue: number | null;
  color: string;
  benchmark: number;
}

export function ScoreCard({ label, value, prevValue, color, benchmark }: Props) {
  const safeVal = value ?? 0;
  const trend = prevValue !== null ? safeVal - (prevValue ?? 0) : 0;
  const belowBenchmark = safeVal < benchmark;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-medium ${belowBenchmark ? 'text-destructive' : 'text-foreground'}`}>{label}</span>
          <div className="flex items-center gap-1.5">
            {trend !== 0 && (
              <span className={`flex items-center text-[10px] ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {Math.abs(trend)}
              </span>
            )}
            <span className="font-mono text-xs font-semibold">{safeVal}</span>
          </div>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden relative">
          {/* Benchmark marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-muted-foreground/30"
            style={{ left: `${(benchmark / 10) * 100}%` }}
          />
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(safeVal / 10) * 100}%`,
              backgroundColor: belowBenchmark ? 'hsl(var(--destructive))' : color,
            }}
          />
        </div>
      </div>
    </div>
  );
}
