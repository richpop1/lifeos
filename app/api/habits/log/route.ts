export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function POST(req: Request) {
  try {
    await requireUserId();
    const body = await req.json();
    const dateStr = body.date ?? new Date().toISOString().split('T')[0];
    const date = new Date(dateStr + 'T00:00:00.000Z');
    
    const existing = await prisma.habitLog.findUnique({
      where: { habitId_date: { habitId: body.habitId, date } },
    });
    
    if (existing) {
      await prisma.habitLog.delete({ where: { id: existing.id } });
      return NextResponse.json({ toggled: false });
    }
    
    const log = await prisma.habitLog.create({
      data: { habitId: body.habitId, date, done: true },
    });
    return NextResponse.json({ toggled: true, log });
  } catch (error) {
    return handleApiError(error);
  }
}
