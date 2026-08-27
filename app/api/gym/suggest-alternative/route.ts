export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — suggest alternative exercise when equipment not available
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { exerciseId, reason } = body;

    if (!exerciseId) return NextResponse.json({ error: 'exerciseId required' }, { status: 400 });

    const exercise = await prisma.exercise.findFirst({
      where: { id: exerciseId, OR: [{ userId: null }, { userId }] },
    });
    if (!exercise) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });

    // Find alternatives: same muscle group, different equipment
    const alternatives = await prisma.exercise.findMany({
      where: {
        muscleGroup: exercise.muscleGroup,
        id: { not: exerciseId },
        OR: [{ userId: null }, { userId }],
      },
      select: { id: true, name: true, equipment: true, category: true, guide: true },
    });

    // Prioritize: bodyweight first, then different equipment
    const sorted = alternatives.sort((a, b) => {
      if (a.equipment === 'bodyweight' && b.equipment !== 'bodyweight') return -1;
      if (b.equipment === 'bodyweight' && a.equipment !== 'bodyweight') return 1;
      if (a.equipment !== exercise.equipment && b.equipment === exercise.equipment) return -1;
      return 0;
    });

    return NextResponse.json({
      original: { id: exercise.id, name: exercise.name, equipment: exercise.equipment },
      alternatives: sorted.slice(0, 5),
    });
  } catch (e: any) { return handleApiError(e); }
}
