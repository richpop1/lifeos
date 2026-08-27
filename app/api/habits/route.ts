export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const habits = await prisma.habit.findMany({
      where: { userId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        goal: { select: { id: true, title: true, pillar: true } },
        logs: {
          where: {
            date: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7)),
            },
          },
          orderBy: { date: 'desc' },
        },
      },
    });
    return NextResponse.json(habits);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const habit = await prisma.habit.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        pillar: body.pillar ?? null,
        frequency: body.frequency ?? 'daily',
        customDays: body.customDays ?? null,
        targetTime: body.targetTime ?? null,
        icon: body.icon ?? null,
        color: body.color ?? null,
        goalId: body.goalId ?? null,
      },
    });
    return NextResponse.json(habit, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
