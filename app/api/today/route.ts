import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();

    // Get user profile for delta calculation
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        lastActiveAt: true,
        lastBriefingAt: true,
        sessionContext: true,
        aiPreferences: true,
        mission: true,
        northStar: true,
        alterEgoName: true,
        alterEgoMantra: true,
      },
    });

    const lastActiveAt = profile?.lastActiveAt || new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get timezone from aiPreferences
    const aiPrefs = profile?.aiPreferences as any;
    const tz = aiPrefs?.timezone || 'Asia/Singapore';

    // Calculate today's date boundaries in user's timezone
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC
    const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
      + new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime()
      - now.getTime();
    
    const todayUTCStart = new Date(todayStart.getTime() - (new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()));
    const todayUTCEnd = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);

    // Parallel fetch everything
    const [dailyFocus, tasks, habits, habitLogs, upcomingEvents, newEmails, activityItems, pendingBatches] = await Promise.all([
      // Today's focus (if set)
      prisma.dailyFocus.findFirst({
        where: { userId, date: { gte: todayUTCStart, lt: todayUTCEnd } },
        orderBy: { createdAt: 'desc' },
      }),

      // Active tasks (prioritized)
      prisma.task.findMany({
        where: {
          userId,
          status: { in: ['todo', 'in-progress'] },
        },
        include: { goal: { select: { id: true, title: true, pillar: true } } },
        orderBy: [
          { isNeedleMover: 'desc' },
          { priority: 'asc' }, // 'high' < 'low' alphabetically, but we'll sort in JS
        ],
        take: 20,
      }),

      // Active habits
      prisma.habit.findMany({
        where: { userId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),

      // Today's habit logs
      prisma.habitLog.findMany({
        where: {
          habit: { userId },
          date: { gte: todayUTCStart, lt: todayUTCEnd },
        },
      }),

      // Upcoming events (next 24h)
      prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: { gte: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: 'asc' },
        take: 5,
      }),

      // New emails since lastActiveAt (that need attention)
      prisma.email.count({
        where: {
          userId,
          createdAt: { gte: lastActiveAt },
          autoProcessed: false,
          userAction: null,
          aiUrgency: { in: ['critical', 'high', 'medium'] },
        },
      }),

      // Activity feed (unread items)
      prisma.activityFeed.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // Pending AI batch actions
      prisma.aiBatchAction.findMany({
        where: { userId, status: 'pending_approval' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Sort tasks: needle movers first, then by priority
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sortedTasks = tasks.sort((a: any, b: any) => {
      if (a.isNeedleMover !== b.isNeedleMover) return a.isNeedleMover ? -1 : 1;
      return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
    });

    // Build focus items: either from DailyFocus or top 3 tasks
    const focusItems = dailyFocus?.focusItems
      ? (dailyFocus.focusItems as any[])
      : sortedTasks.slice(0, 3).map((t: any) => ({
          title: t.title,
          taskId: t.id,
          goalId: t.goalId,
          pillar: t.pillar || t.goal?.pillar,
          urgency: t.aiUrgency || t.priority,
          isNeedleMover: t.isNeedleMover,
        }));

    // Calculate habits completion
    const completedHabitIds = new Set(habitLogs.filter((l: any) => l.done).map((l: any) => l.habitId));
    const habitsWithStatus = habits.map((h: any) => ({
      id: h.id,
      title: h.title,
      icon: h.icon,
      color: h.color,
      done: completedHabitIds.has(h.id),
      targetTime: h.targetTime,
    }));

    // Delta summary
    const timeSinceActive = now.getTime() - lastActiveAt.getTime();
    const hoursSince = Math.round(timeSinceActive / (1000 * 60 * 60));

    return NextResponse.json({
      // Session continuity
      lastActiveAt: lastActiveAt.toISOString(),
      hoursSinceActive: hoursSince,
      sessionContext: profile?.sessionContext,
      
      // Identity
      mission: profile?.mission,
      northStar: profile?.northStar,
      alterEgoName: profile?.alterEgoName,
      alterEgoMantra: profile?.alterEgoMantra,

      // Today's content
      focusItems,
      dailyFocusId: dailyFocus?.id,
      tasks: sortedTasks.slice(0, 10),
      habits: habitsWithStatus,
      upcomingEvents,
      
      // Delta
      newEmailCount: newEmails,
      activityFeed: activityItems,
      pendingBatches,

      // Stats
      totalActiveTasks: tasks.length,
      habitsCompleted: completedHabitIds.size,
      habitsTotal: habits.length,
    });
  } catch (e: any) {
    return handleApiError(e);
  }
}
