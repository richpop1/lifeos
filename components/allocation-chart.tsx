'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#5B9A8B', '#4ADE80', '#FB923C', '#F472B6', '#818CF8', '#FBBF24', '#67E8F9', '#A78BFA'];

interface Props {
  data: { name: string; value: number }[];
}

export default function AllocationChart({ data }: Props) {
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => `$${Number(v).toLocaleString('en-SG', { minimumFractionDigits: 0 })}`} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
