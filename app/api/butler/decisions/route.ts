export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

/**
 * GET /api/butler/decisions?status=pending&limit=20
 * List decisions with optional filters.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    const decisions = await prisma.decision.findMany({
      where: { userId, status },
      orderBy: [{ urgency: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    return NextResponse.json({ decisions, total: decisions.length });
  } catch (error) {
    return handleApiError(error);
  }
}
