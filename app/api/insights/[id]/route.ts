export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// PATCH — mark insight as read or dismissed
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    
    const existing = await prisma.insight.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = {};
    if (body.isRead !== undefined) updateData.isRead = body.isRead;
    if (body.isDismissed !== undefined) updateData.isDismissed = body.isDismissed;

    const updated = await prisma.insight.update({ where: { id: params.id }, data: updateData });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE — remove an insight
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.insight.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.insight.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
