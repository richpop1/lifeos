export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const contactId = params.id;

    // Verify contact belongs to user
    const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const body = await req.json();
    const { content, type, date } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const note = await prisma.contactNote.create({
      data: {
        contactId,
        content: content.trim(),
        type: type || 'note',
        date: date ? new Date(date) : new Date(),
      },
    });

    // Update lastContactedAt on the contact
    const noteDate = date ? new Date(date) : new Date();
    if (!contact.lastContactedAt || noteDate > contact.lastContactedAt) {
      await prisma.contact.update({
        where: { id: contactId },
        data: { lastContactedAt: noteDate },
      });
    }

    return NextResponse.json(note, { status: 201 });
  } catch (e: any) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get('noteId');
    if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 });

    // Verify contact belongs to user
    const contact = await prisma.contact.findFirst({ where: { id: params.id, userId } });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    await prisma.contactNote.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return handleApiError(e);
  }
}
