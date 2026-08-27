export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function POST() {
  try {
    const userId = await requireUserId();
    const goals = await prisma.goal.findMany({
      where: { userId, status: 'active', metricSource: { not: null } },
      include: { tasks: { select: { status: true } } },
    });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);

    const updates: { id: string; current: number }[] = [];

    for (const goal of goals) {
      let current: number | null = null;
      const config = (goal.metricConfig || {}) as Record<string, any>;
      const dateRange = config.dateRange || 'month';
      const rangeStart = dateRange === 'year' ? thisYearStart : thisMonthStart;

      switch (goal.metricSource) {
        case 'transactions': {
          const where: any = { userId, date: { gte: rangeStart } };
          if (config.type) where.type = config.type;
          if (config.category) where.category = { contains: config.category, mode: 'insensitive' };
          const txns = await prisma.transaction.findMany({ where, select: { amount: true } });
          current = txns.reduce((s, t) => s + t.amount, 0);
          break;
        }
        case 'habits': {
          if (config.habitId) {
            const logs = await prisma.habitLog.findMany({
              where: { habitId: config.habitId, date: { gte: rangeStart } },
            });
            current = logs.length; // count of completions
          }
          break;
        }
        case 'life_score': {
          const latest = await prisma.lifeScore.findFirst({
            where: { userId },
            orderBy: { date: 'desc' },
          });
          if (latest && config.scoreField) {
            current = (latest as any)[config.scoreField] ?? null;
          } else if (latest) {
            current = (latest as any).overall ?? null;
          }
          break;
        }
        case 'tasks': {
          // Progress = done tasks / total tasks for this goal
          const total = goal.tasks.length;
          const done = goal.tasks.filter(t => t.status === 'done').length;
          current = total > 0 ? done : 0;
          break;
        }
        case 'manual':
        default:
          continue; // skip — user updates manually
      }

      if (current !== null) {
        updates.push({ id: goal.id, current });
      }
    }

    // Batch update
    await Promise.all(
      updates.map(u => prisma.goal.update({ where: { id: u.id }, data: { current: u.current } }))
    );

    return NextResponse.json({ updated: updates.length, goals: updates });
  } catch (e: any) { return handleApiError(e); }
}
