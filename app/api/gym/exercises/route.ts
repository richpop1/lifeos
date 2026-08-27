export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — list exercises (system + user custom)
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const muscleGroup = searchParams.get('muscleGroup');
    const equipment = searchParams.get('equipment');
    const search = searchParams.get('search');

    const where: any = {
      OR: [{ userId: null }, { userId }],
    };
    if (muscleGroup) where.muscleGroup = muscleGroup;
    if (equipment) where.equipment = equipment;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const exercises = await prisma.exercise.findMany({
      where,
      orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json(exercises);
  } catch (e: any) { return handleApiError(e); }
}

// POST — create custom exercise
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, muscleGroup, equipment, guide, category } = body;

    if (!name || !muscleGroup) {
      return NextResponse.json({ error: 'Name and muscle group required' }, { status: 400 });
    }

    const exercise = await prisma.exercise.create({
      data: {
        userId,
        name,
        muscleGroup,
        equipment: equipment || null,
        guide: guide || null,
        category: category || null,
        isCustom: true,
      },
    });

    return NextResponse.json(exercise);
  } catch (e: any) { return handleApiError(e); }
}
