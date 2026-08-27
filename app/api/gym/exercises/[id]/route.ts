export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// PATCH — update custom exercise
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, muscleGroup, equipment, guide, category } = body;

    // Only allow editing custom exercises owned by user
    const existing = await prisma.exercise.findFirst({
      where: { id: params.id, userId, isCustom: true },
    });
    if (!existing) return NextResponse.json({ error: 'Exercise not found or not editable' }, { status: 404 });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (muscleGroup !== undefined) data.muscleGroup = muscleGroup;
    if (equipment !== undefined) data.equipment = equipment;
    if (guide !== undefined) data.guide = guide;
    if (category !== undefined) data.category = category;

    const updated = await prisma.exercise.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE — delete custom exercise
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.exercise.findFirst({
      where: { id: params.id, userId, isCustom: true },
    });
    if (!existing) return NextResponse.json({ error: 'Exercise not found or not deletable' }, { status: 404 });

    await prisma.exercise.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}

// GET — single exercise with PRs
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const exercise = await prisma.exercise.findFirst({
      where: { id: params.id, OR: [{ userId: null }, { userId }] },
    });
    if (!exercise) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const records = await prisma.personalRecord.findMany({
      where: { userId, exerciseId: params.id },
      orderBy: { achievedAt: 'desc' },
    });

    // Recent sets for this exercise
    const recentSets = await prisma.workoutSet.findMany({
      where: { exerciseId: params.id, session: { userId } },
      include: { session: { select: { name: true, startedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ ...exercise, records, recentSets });
  } catch (e: any) { return handleApiError(e); }
}
