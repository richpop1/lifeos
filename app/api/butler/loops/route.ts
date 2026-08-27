export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

/**
 * GET /api/butler/loops?status=open&limit=20
 * List open loops with optional filters.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'open';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: any = { userId, status };
    // For open loops, only show those whose wakeDate has passed
    if (status === 'open') {
      where.OR = [{ wakeDate: null }, { wakeDate: { lte: new Date() } }];
    }

    const loops = await prisma.openLoop.findMany({
      where,
      orderBy: [{ urgency: 'asc' }, { deferCount: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });

    const total = await prisma.openLoop.count({ where: { userId, status } });

    return NextResponse.json({ loops, total });
  } catch (error) {
    return handleApiError(error);
  }
}
