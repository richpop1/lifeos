export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import crypto from 'crypto';

// GET: return current feed token (or null)
export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return NextResponse.json({ token: profile?.calFeedToken || null });
  } catch (e: any) { return handleApiError(e); }
}

// POST: generate new feed token (regenerate if exists)
export async function POST() {
  try {
    const userId = await requireUserId();
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, calFeedToken: token },
      update: { calFeedToken: token },
    });
    return NextResponse.json({ token });
  } catch (e: any) { return handleApiError(e); }
}

// DELETE: revoke feed token
export async function DELETE() {
  try {
    const userId = await requireUserId();
    await prisma.userProfile.updateMany({
      where: { userId },
      data: { calFeedToken: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
