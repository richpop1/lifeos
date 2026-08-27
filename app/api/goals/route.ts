export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
      include: { tasks: { orderBy: { createdAt: 'desc' } } },
    });
    return NextResponse.json(goals);
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const goal = await prisma.goal.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        type: body.type ?? 'short-term',
        pillar: body.pillar ?? null,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        weight: body.weight ?? 5,
        isProject: body.isProject ?? false,
        target: body.target ?? null,
        unit: body.unit ?? null,
        metricSource: body.metricSource ?? null,
        metricConfig: body.metricConfig ?? null,
      },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}
