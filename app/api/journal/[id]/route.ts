export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET single journal entry
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const entry = await prisma.journalEntry.findFirst({
      where: { id: params.id, userId },
      include: { goal: { select: { id: true, title: true } } },
    });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(entry);
  } catch (e: any) { return handleApiError(e); }
}

// PATCH — edit journal entry fields
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.journalEntry.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const updateData: any = {};

    // Editable fields
    const stringFields = [
      'sessionType', 'moodStart', 'moodEnd', 'dayTitle', 'focusItem',
      'cleanWin', 'focusRazor', 'signal', 'personalMirror', 'humanClose',
      'dailyLine', 'razorSummary',
    ];
    for (const f of stringFields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    if (body.energy !== undefined) updateData.energy = body.energy;
    if (body.chatMessages !== undefined) updateData.chatMessages = body.chatMessages;
    if (body.keyMemories !== undefined) updateData.keyMemories = body.keyMemories;
    if (body.ideas !== undefined) updateData.ideas = body.ideas;
    if (body.goalId !== undefined) updateData.goalId = body.goalId || null;
    if (body.responses !== undefined) updateData.responses = body.responses;
    if (body.mediaUrls !== undefined) updateData.mediaUrls = body.mediaUrls;
    if (body.date !== undefined) {
      // Preserve original time-of-day, only change the calendar date
      const existingDate = new Date(existing.date);
      const [year, month, day] = body.date.split('-').map(Number);
      existingDate.setUTCFullYear(year, month - 1, day);
      updateData.date = existingDate;
    }

    const updated = await prisma.journalEntry.update({
      where: { id: params.id },
      data: updateData,
      include: { goal: { select: { id: true, title: true } } },
    });

    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE — remove journal entry
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.journalEntry.findFirst({ where: { id: params.id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Also delete any contact notes linked to this journal entry
    await prisma.contactNote.deleteMany({ where: { journalEntryId: params.id } });
    await prisma.journalEntry.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}
