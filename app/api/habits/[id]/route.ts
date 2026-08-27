export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    await prisma.habit.deleteMany({ where: { id: params.id, userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const fields = ['title', 'description', 'pillar', 'frequency', 'customDays', 'targetTime', 'icon', 'color', 'isActive', 'sortOrder', 'reminderEnabled', 'goalId'];
    const data: any = {};
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    const habit = await prisma.habit.updateMany({ where: { id: params.id, userId }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}