export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — list templates
export async function GET() {
  try {
    const userId = await requireUserId();
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (e: any) { return handleApiError(e); }
}

// POST — create template
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, description, exercises, targetMuscles, durationMins, isAiGenerated } = body;

    if (!name || !exercises) {
      return NextResponse.json({ error: 'Name and exercises required' }, { status: 400 });
    }

    const template = await prisma.workoutTemplate.create({
      data: {
        userId,
        name,
        description: description || null,
        exercises,
        targetMuscles: targetMuscles || null,
        durationMins: durationMins || null,
        isAiGenerated: isAiGenerated || false,
      },
    });

    return NextResponse.json(template);
  } catch (e: any) { return handleApiError(e); }
}
