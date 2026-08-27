export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — all PRs for user, optionally filtered by exercise
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const exerciseId = searchParams.get('exerciseId');

    const where: any = { userId };
    if (exerciseId) where.exerciseId = exerciseId;

    const records = await prisma.personalRecord.findMany({
      where,
      include: { exercise: { select: { name: true, muscleGroup: true } } },
      orderBy: { achievedAt: 'desc' },
    });

    return NextResponse.json(records);
  } catch (e: any) { return handleApiError(e); }
}
