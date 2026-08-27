export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const contact = await prisma.contact.findFirst({
      where: { id: params.id, userId },
      include: {
        group: true,
        notes: { orderBy: { date: 'desc' } },
      },
    });
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(contact);
  } catch (e: any) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // Ensure contact belongs to user
    const existing = await prisma.contact.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = {};
    const fields = ['name', 'nickname', 'email', 'phone', 'company', 'role', 'relationship', 'groupId', 'avatar', 'birthday', 'howWeMet', 'interests', 'familyNotes', 'socialLinks', 'aliases', 'customDates', 'isFavorite', 'isArchived', 'lastContactedAt'];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    if (body.catchUpFrequency !== undefined) {
      updateData.catchUpFrequency = body.catchUpFrequency ? parseInt(body.catchUpFrequency) : null;
    }

    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: updateData,
      include: { group: true, notes: { orderBy: { date: 'desc' } } },
    });

    return NextResponse.json(contact);
  } catch (e: any) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.contact.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.contact.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return handleApiError(e);
  }
}
