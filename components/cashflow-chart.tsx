'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  data: { month: string; income: number; expense: number }[];
}

export default function CashflowChart({ data }: Props) {
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 10 }} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => `$${Number(v).toLocaleString('en-SG', { minimumFractionDigits: 0 })}`} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="income" fill="#4ADE80" radius={[3, 3, 0, 0]} name="Income" />
        <Bar dataKey="expense" fill="#F87171" radius={[3, 3, 0, 0]} name="Expense" />
      </BarChart>
    </ResponsiveContainer>
  );
}
