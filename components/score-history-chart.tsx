'use client';
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
  scores: any[];
}

export default function ScoreHistoryChart({ scores }: Props) {
  const data = useMemo(() => {
    return (scores ?? []).map((s: any) => {
      const wealthAvg = ((s?.activeIncome ?? 0) + (s?.passiveIncome ?? 0) + (s?.riskManagement ?? 0) + (s?.personalBudget ?? 0)) / 4;
      const healthAvg = ((s?.physical ?? 0) + (s?.emotional ?? 0) + (s?.mental ?? 0) + (s?.spiritual ?? 0)) / 4;
      const relAvg = ((s?.partner ?? 0) + (s?.family ?? 0) + (s?.friends ?? 0) + (s?.community ?? 0)) / 4;
      return {
        date: new Date(s?.date ?? Date.now()).toLocaleDateString('en-SG', { month: 'short', year: '2-digit' }),
        Wealth: parseFloat(wealthAvg.toFixed(1)),
        Health: parseFloat(healthAvg.toFixed(1)),
        Relationships: parseFloat(relAvg.toFixed(1)),
      };
    });
  }, [scores]);

  if (!data?.length) return <p className="text-sm text-muted-foreground">No data yet</p>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 25 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
          label={{ value: 'Date', position: 'insideBottom', offset: -15, style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <YAxis
          domain={[0, 10]}
          tickLine={false}
          tick={{ fontSize: 10 }}
          label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="Wealth" stroke="#5B9A8B" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Health" stroke="#E8913A" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Relationships" stroke="#D94F7A" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
