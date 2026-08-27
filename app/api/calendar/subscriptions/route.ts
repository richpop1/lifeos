export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET all subscriptions
export async function GET() {
  try {
    const userId = await requireUserId();
    const subs = await prisma.calendarSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(subs);
  } catch (e: any) { return handleApiError(e); }
}

// POST create subscription
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, url, color } = body;

    if (!name || !url) return NextResponse.json({ error: 'Name and URL required' }, { status: 400 });

    const sub = await prisma.calendarSubscription.create({
      data: { userId, name, url, color: color || '#6366f1' },
    });

    return NextResponse.json(sub);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE subscription
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Delete associated events too
    await prisma.calendarEvent.deleteMany({ where: { subId: id, userId } });
    await prisma.calendarSubscription.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
