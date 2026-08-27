export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
      include: { goal: { select: { id: true, title: true, pillar: true, weight: true, isProject: true } } },
    });
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(task);
  } catch (e: any) { return handleApiError(e); }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    // Sanitize — only allow known fields
    const data: any = {};
    const fields = ['title', 'description', 'pillar', 'goalId', 'status', 'priority', 'isNeedleMover', 'aiUrgency', 'aiRecommendation', 'linkedHabitId', 'northStarAlign', 'notes', 'resolution', 'resolvedReason', 'delegatedTo', 'contributionType', 'triageStatus', 'sourceEmailId'];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.scheduledDate !== undefined) data.scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : null;
    if (body.scheduledStartTime !== undefined) data.scheduledStartTime = body.scheduledStartTime ? new Date(body.scheduledStartTime) : null;
    if (body.scheduledEndTime !== undefined) data.scheduledEndTime = body.scheduledEndTime ? new Date(body.scheduledEndTime) : null;
    if (body.estimatedMins !== undefined) data.estimatedMins = body.estimatedMins ? parseInt(body.estimatedMins) : null;
    if (body.actualMins !== undefined) data.actualMins = body.actualMins ? parseInt(body.actualMins) : null;
    if (body.subtasks !== undefined) data.subtasks = body.subtasks as any;
    if (body.resolvedAt !== undefined) data.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt) : null;
    // Auto-set resolvedAt when resolution is provided
    if (body.resolution && !body.resolvedAt) data.resolvedAt = new Date();
    // If resolution is 'completed', also set status to 'done'
    if (body.resolution === 'completed' && !body.status) data.status = 'done';
    // When task marked done, clear scheduled times (removes from calendar)
    if (data.status === 'done') {
      data.scheduledStartTime = null;
      data.scheduledEndTime = null;
    }
    
    // Auto-recalculate goal progress when task status changes
    const task = await prisma.task.findFirst({ where: { id: params.id, userId }, select: { goalId: true } });
    await prisma.task.updateMany({ where: { id: params.id, userId }, data });
    
    // If task has a goal, recalculate goal progress
    const goalId = body.goalId !== undefined ? body.goalId : task?.goalId;
    if (goalId) {
      const goalTasks = await prisma.task.findMany({ where: { goalId } });
      const done = goalTasks.filter(t => t.status === 'done').length;
      const progress = goalTasks.length > 0 ? Math.round((done / goalTasks.length) * 100) : 0;
      await prisma.goal.update({ where: { id: goalId }, data: { progress } });
    }
    
    const updated = await prisma.task.findFirst({
      where: { id: params.id, userId },
      include: { goal: { select: { id: true, title: true, pillar: true, weight: true, isProject: true } } },
    });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    // Get task before deleting to recalculate goal progress
    const task = await prisma.task.findFirst({ where: { id: params.id, userId }, select: { goalId: true } });
    await prisma.task.deleteMany({ where: { id: params.id, userId } });
    
    // Recalculate goal progress
    if (task?.goalId) {
      const goalTasks = await prisma.task.findMany({ where: { goalId: task.goalId } });
      const done = goalTasks.filter(t => t.status === 'done').length;
      const progress = goalTasks.length > 0 ? Math.round((done / goalTasks.length) * 100) : 0;
      await prisma.goal.update({ where: { id: task.goalId }, data: { progress } });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
