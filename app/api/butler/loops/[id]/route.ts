export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { logEvent } from '@/lib/butler/events';

/**
 * GET /api/butler/loops/[id] — get a single loop
 * PATCH /api/butler/loops/[id] — triage (update status, resolution, nextStep, wakeDate)
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const loop = await prisma.openLoop.findFirst({ where: { id: params.id, userId } });
    if (!loop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(loop);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const loop = await prisma.openLoop.findFirst({ where: { id: params.id, userId } });
    if (!loop) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const data: any = {};

    if (body.status) {
      data.status = body.status;
      if (body.status === 'deferred') {
        data.deferCount = { increment: 1 };
        data.wakeDate = body.wakeDate ? new Date(body.wakeDate) : new Date(Date.now() + 86400000);
      }
      if (['pursued', 'cut', 'resolved'].includes(body.status)) {
        data.resolvedAt = new Date();
      }
    }
    if (body.resolution !== undefined) data.resolution = body.resolution;
    if (body.nextStep !== undefined) data.nextStep = body.nextStep;
    if (body.urgency !== undefined) data.urgency = body.urgency;
    if (body.pillar !== undefined) data.pillar = body.pillar;

    const updated = await prisma.openLoop.update({ where: { id: params.id }, data });
    await logEvent(userId, `loop_${body.status || 'updated'}`, 'open_loop', params.id, { resolution: body.resolution });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
