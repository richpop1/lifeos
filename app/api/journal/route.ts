export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') ?? '20');
    const goalId = searchParams.get('goalId');
    
    const where: any = { userId };
    if (goalId) where.goalId = goalId;
    
    const entries = await prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      include: { goal: { select: { id: true, title: true } } },
    });
    return NextResponse.json(entries);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const entry = await prisma.journalEntry.create({
      data: {
        userId,
        sessionType: body.sessionType ?? 'morning',
        moodStart: body.moodStart ?? null,
        moodEnd: body.moodEnd ?? null,
        responses: body.responses ?? [],
        goalId: body.goalId ?? null,
        date: new Date(),
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
