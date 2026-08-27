export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// PATCH — update template
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const existing = await prisma.workoutTemplate.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.exercises !== undefined) data.exercises = body.exercises;
    if (body.targetMuscles !== undefined) data.targetMuscles = body.targetMuscles;
    if (body.durationMins !== undefined) data.durationMins = body.durationMins;

    const updated = await prisma.workoutTemplate.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.workoutTemplate.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.workoutTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}
