export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET events within a date range
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const where: any = { userId };
    if (start) where.startTime = { gte: new Date(start) };
    if (end) where.startTime = { ...where.startTime, lte: new Date(end) };

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: { task: { select: { id: true, title: true, status: true } } },
    });

    // Merge tasks with scheduled times as virtual calendar events
    const taskWhere: any = { userId, status: { not: 'done' }, scheduledStartTime: { not: null } };
    if (start) taskWhere.scheduledStartTime = { ...taskWhere.scheduledStartTime, gte: new Date(start) };
    if (end) taskWhere.scheduledStartTime = { ...taskWhere.scheduledStartTime, lte: new Date(end) };
    const scheduledTasks = await prisma.task.findMany({
      where: taskWhere,
      orderBy: { scheduledStartTime: 'asc' },
      select: { id: true, title: true, description: true, scheduledStartTime: true, scheduledEndTime: true, status: true, priority: true, pillar: true, aiUrgency: true, goalId: true, estimatedMins: true },
    });
    const taskEvents = scheduledTasks.map(t => ({
      id: `task-${t.id}`,
      title: t.title,
      description: t.description,
      startTime: t.scheduledStartTime!.toISOString(),
      endTime: t.scheduledEndTime ? t.scheduledEndTime.toISOString() : null,
      allDay: false,
      color: t.aiUrgency === 'critical' ? '#ef4444' : t.aiUrgency === 'high' ? '#f59e0b' : '#8b9e83',
      source: 'task',
      taskId: t.id,
      goalId: t.goalId,
      task: { id: t.id, title: t.title, status: t.status },
    }));

    // Inject habit events as virtual calendar entries
    const habits = await prisma.habit.findMany({
      where: { userId, isActive: true },
      include: { logs: { where: start && end ? { date: { gte: new Date(start), lte: new Date(end) } } : {} } },
    });

    const habitEvents: any[] = [];
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateStr = d.toISOString().split('T')[0];
        for (const h of habits) {
          // Check if habit should occur on this day
          const shouldShow = h.frequency === 'daily'
            || (h.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5)
            || (h.frequency === 'custom' && Array.isArray(h.customDays) && (h.customDays as number[]).includes(dayOfWeek));
          if (!shouldShow) continue;

          const done = h.logs.some(l => new Date(l.date).toISOString().split('T')[0] === dateStr);
          const time = h.targetTime || '08:00';
          const startTime = new Date(`${dateStr}T${time}:00`);
          const endTime = new Date(startTime.getTime() + 30 * 60000);

          habitEvents.push({
            id: `habit-${h.id}-${dateStr}`,
            title: `${h.icon || '✨'} ${h.title}`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            allDay: false,
            color: done ? (h.color || '#6B8F71') : '#94A3B8',
            source: 'habit',
            habitId: h.id,
            habitDone: done,
            description: done ? 'Completed ✓' : 'Not yet done',
          });
        }
      }
    }

    return NextResponse.json([...events, ...taskEvents, ...habitEvents]);
  } catch (e: any) { return handleApiError(e); }
}

// POST create event
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { title, description, startTime, endTime, allDay, location, color, goalId, taskId } = body;

    if (!title || !startTime) {
      return NextResponse.json({ error: 'Title and startTime required' }, { status: 400 });
    }

    const event = await prisma.calendarEvent.create({
      data: {
        userId, title, description,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        allDay: allDay || false,
        location, color,
        goalId: goalId || null,
        taskId: taskId || null,
        source: 'manual',
      },
    });

    return NextResponse.json(event);
  } catch (e: any) { return handleApiError(e); }
}

// PATCH update event (supports both CalendarEvent and task-sourced events)
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { id, title, description, startTime, endTime, allDay, location, color } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Handle task-sourced events (id starts with 'task-')
    if (typeof id === 'string' && id.startsWith('task-')) {
      const taskId = id.replace('task-', '');
      const taskData: any = {};
      if (title !== undefined) taskData.title = title;
      if (description !== undefined) taskData.description = description;
      if (startTime !== undefined) taskData.scheduledStartTime = new Date(startTime);
      if (endTime !== undefined) taskData.scheduledEndTime = endTime ? new Date(endTime) : null;
      const result = await prisma.task.updateMany({ where: { id: taskId, userId }, data: taskData });
      if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const updated = await prisma.task.findUnique({ where: { id: taskId } });
      return NextResponse.json({
        id, title: updated?.title, description: updated?.description,
        startTime: updated?.scheduledStartTime?.toISOString(),
        endTime: updated?.scheduledEndTime?.toISOString(),
        source: 'task', taskId,
      });
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (startTime !== undefined) data.startTime = new Date(startTime);
    if (endTime !== undefined) data.endTime = endTime ? new Date(endTime) : null;
    if (allDay !== undefined) data.allDay = allDay;
    if (location !== undefined) data.location = location;
    if (color !== undefined) data.color = color;
    const event = await prisma.calendarEvent.updateMany({ where: { id, userId }, data });
    if (event.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.calendarEvent.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE event (for task events, clears scheduled time rather than deleting the task)
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Handle task-sourced events
    if (id.startsWith('task-')) {
      const taskId = id.replace('task-', '');
      await prisma.task.updateMany({
        where: { id: taskId, userId },
        data: { scheduledStartTime: null, scheduledEndTime: null },
      });
      return NextResponse.json({ ok: true });
    }

    await prisma.calendarEvent.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
