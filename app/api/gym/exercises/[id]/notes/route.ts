export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — the current user's remark for this exercise
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const note = await prisma.exerciseNote.findUnique({
      where: { userId_exerciseId: { userId, exerciseId: params.id } },
    });
    return NextResponse.json({ note: note?.note ?? '' });
  } catch (e: any) { return handleApiError(e); }
}

// PUT — upsert the current user's remark (empty string deletes it)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const note = (body.note ?? '').toString();

    if (!note.trim()) {
      await prisma.exerciseNote.deleteMany({ where: { userId, exerciseId: params.id } });
      return NextResponse.json({ note: '' });
    }

    const saved = await prisma.exerciseNote.upsert({
      where: { userId_exerciseId: { userId, exerciseId: params.id } },
      update: { note },
      create: { userId, exerciseId: params.id, note },
    });
    return NextResponse.json({ note: saved.note });
  } catch (e: any) { return handleApiError(e); }
}
