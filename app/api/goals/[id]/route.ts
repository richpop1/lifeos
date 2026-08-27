export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const goal = await prisma.goal.findFirst({
      where: { id: params.id, userId },
      include: {
        tasks: { orderBy: { createdAt: 'desc' } },
        journalEntries: { orderBy: { date: 'desc' }, take: 10, select: { id: true, date: true, dayTitle: true, sessionType: true } },
      },
    });
    if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(goal);
  } catch (e: any) { return handleApiError(e); }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    // Sanitize update data
    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.type !== undefined) data.type = body.type;
    if (body.pillar !== undefined) data.pillar = body.pillar;
    if (body.status !== undefined) data.status = body.status;
    if (body.progress !== undefined) data.progress = body.progress;
    if (body.targetDate !== undefined) data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    if (body.weight !== undefined) data.weight = body.weight;
    if (body.isProject !== undefined) data.isProject = body.isProject;
    if (body.target !== undefined) data.target = body.target;
    if (body.current !== undefined) data.current = body.current;
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.metricSource !== undefined) data.metricSource = body.metricSource;
    if (body.metricConfig !== undefined) data.metricConfig = body.metricConfig;
    const goal = await prisma.goal.updateMany({ where: { id: params.id, userId }, data });
    return NextResponse.json(goal);
  } catch (e: any) { return handleApiError(e); }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    await prisma.goal.deleteMany({ where: { id: params.id, userId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
