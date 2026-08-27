export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { logEvent } from '@/lib/butler/events';

/**
 * GET /api/butler/decisions/[id] — get a single decision
 * PATCH /api/butler/decisions/[id] — resolve a decision
 *   Body: { chosenOption: number, status?: 'decided'|'deferred'|'dismissed' }
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const decision = await prisma.decision.findFirst({ where: { id: params.id, userId } });
    if (!decision) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(decision);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const decision = await prisma.decision.findFirst({ where: { id: params.id, userId } });
    if (!decision) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const data: any = {};

    if (body.chosenOption !== undefined) data.chosenOption = body.chosenOption;
    if (body.status) {
      data.status = body.status;
      if (body.status === 'decided') data.executedAt = new Date();
    }
    if (body.executedRunId) data.executedRunId = body.executedRunId;

    const updated = await prisma.decision.update({ where: { id: params.id }, data });
    await logEvent(userId, `decision_${body.status || 'updated'}`, 'decision', params.id, {
      chosenOption: body.chosenOption,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
