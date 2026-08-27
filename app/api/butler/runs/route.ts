export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

/**
 * GET /api/butler/runs?status=completed&limit=20
 * Audit log: list agent runs with optional filters.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const where: any = { userId };
    if (status) where.status = status;

    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        toolCalls: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, tool: true, args: true, status: true, approved: true, durationMs: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ runs, total: runs.length });
  } catch (error) {
    return handleApiError(error);
  }
}
