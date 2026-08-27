export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — single session with sets
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const session = await prisma.workoutSession.findFirst({
      where: { id: params.id, userId },
      include: {
        sets: { include: { exercise: { select: { name: true, muscleGroup: true } } }, orderBy: { setNumber: 'asc' } },
        template: { select: { name: true } },
      },
    });
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(session);
  } catch (e: any) { return handleApiError(e); }
}

// PATCH — update session (complete, add notes/mood)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const existing = await prisma.workoutSession.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    if (body.completedAt !== undefined) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
    if (body.durationMins !== undefined) data.durationMins = body.durationMins;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.mood !== undefined) data.mood = body.mood;
    if (body.name !== undefined) data.name = body.name;

    const updated = await prisma.workoutSession.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.workoutSession.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.workoutSession.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}
