export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
function hoursBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 3600000);
}

// Recency thresholds (configurable via aiPreferences in future)
const EMAIL_MAX_AGE_HOURS = 72; // Only show emails needing reply within 72h
const TASK_OVERDUE_MAX_DAYS = 14; // Only show tasks overdue within 14 days
const CONTACT_OVERDUE_MULTIPLIER = 1.5; // Show contact if overdue > 1.5x frequency

export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Recency cutoffs
    const emailCutoff = new Date(now.getTime() - EMAIL_MAX_AGE_HOURS * 3600000);
    const taskOverdueCutoff = new Date(todayStart.getTime() - TASK_OVERDUE_MAX_DAYS * 86400000);

    // Week range for calendar events (Mon-Sun of current week in SGT)
    const sgt = new Date(now.getTime() + 8 * 3600000);
    const sgtDay = sgt.getUTCDay(); // 0=Sun
    const mondayOffset = sgtDay === 0 ? -6 : 1 - sgtDay;
    const weekStartSGT = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate() + mondayOffset));
    const weekEndSGT = new Date(weekStartSGT.getTime() + 7 * 86400000);

    const [
      overdueTasks, urgentEmails, contacts,
      budgets, monthTxns,
      todayTasks, doneTodayTasks,
      habits, recentScores, activeGoals,
      dailyFocus, profile,
      weekEvents, calSubs
    ] = await Promise.all([
      // Overdue tasks — only within recency window
      prisma.task.findMany({
        where: {
          userId,
          status: { not: 'done' },
          triageStatus: { not: 'dismissed' },
          dueDate: { lt: todayStart, gte: taskOverdueCutoff },
        },
        select: { id: true, title: true, dueDate: true, priority: true, pillar: true, isNeedleMover: true },
        orderBy: { dueDate: 'desc' }, take: 5,
      }),
      // Emails needing reply — only within recency window AND not already actioned
      prisma.email.findMany({
        where: {
          userId,
          isRead: true,
          aiAction: 'reply_needed',
          userAction: null,
          date: { gte: emailCutoff, lt: new Date(now.getTime() - 3600000) }, // at least 1h old, max 72h
        },
        select: { id: true, subject: true, fromName: true, date: true },
        orderBy: { date: 'desc' },
        take: 5,
      }),
      // Overdue contacts
      prisma.contact.findMany({
        where: { userId, catchUpFrequency: { not: null } },
        select: { id: true, name: true, catchUpFrequency: true, lastContactedAt: true },
      }),
      // Budget data
      prisma.budget.findMany({ where: { userId, month: now.getMonth() + 1, year: now.getFullYear() } }),
      prisma.transaction.findMany({
        where: { userId, type: 'expense', date: { gte: thisMonthStart } },
        select: { category: true, amount: true },
      }),
      // Today's tasks
      prisma.task.findMany({
        where: {
          userId,
          status: { not: 'done' },
          triageStatus: { not: 'dismissed' },
          OR: [
            { dueDate: { gte: todayStart, lt: tomorrowStart } },
            { scheduledDate: { gte: todayStart, lt: tomorrowStart } },
          ],
        },
        select: { id: true, title: true, priority: true, isNeedleMover: true, pillar: true, dueDate: true, goalId: true, sourceEmailId: true, triageStatus: true },
        orderBy: [{ isNeedleMover: 'desc' }, { priority: 'asc' }],
      }),
      // Tasks done today
      prisma.task.findMany({
        where: { userId, status: 'done', updatedAt: { gte: todayStart } },
        select: { id: true },
      }),
      // Habits with recent logs
      prisma.habit.findMany({
        where: { userId, isActive: true },
        include: { logs: { where: { date: { gte: new Date(now.getTime() - 8 * 86400000) } }, orderBy: { date: 'desc' } } },
      }),
      // Recent life scores
      prisma.lifeScore.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 2 }),
      // Active goals
      prisma.goal.findMany({
        where: { userId, status: 'active' },
        select: { id: true, title: true, target: true, current: true, unit: true, metricSource: true, progress: true, pillar: true },
        take: 10,
      }),
      // Today's daily focus
      prisma.dailyFocus.findUnique({
        where: { userId_date: { userId, date: todayStart } },
      }),
      // Profile for identity/north star
      prisma.userProfile.findUnique({ where: { userId } }),
      // Calendar events for the week
      prisma.calendarEvent.findMany({
        where: { userId, startTime: { gte: weekStartSGT, lt: weekEndSGT } },
        orderBy: { startTime: 'asc' },
        select: { id: true, title: true, startTime: true, endTime: true, allDay: true, location: true, color: true, source: true },
      }),
      // Calendar subscriptions
      prisma.calendarSubscription.findMany({
        where: { userId, isActive: true },
        select: { id: true, name: true, lastSynced: true },
      }),
    ]);

    // === NEEDS ATTENTION (recency-filtered, actionable) ===
    const attention: {
      type: string; title: string; detail: string; id?: string;
      severity: 'high' | 'medium'; action: string; actionLabel: string;
    }[] = [];

    // Overdue tasks (only recent ones)
    for (const t of overdueTasks) {
      const days = daysBetween(t.dueDate!, now);
      attention.push({
        type: 'overdue_task', title: t.title,
        detail: `${days}d overdue${t.isNeedleMover ? ' · Needle mover' : ''}`,
        id: t.id,
        severity: t.priority === 'high' || t.isNeedleMover ? 'high' : 'medium',
        action: 'reschedule_or_complete',
        actionLabel: 'Handle',
      });
    }

    // Budget alerts (>85%)
    const spendByCategory: Record<string, number> = {};
    for (const t of monthTxns) {
      spendByCategory[t.category] = (spendByCategory[t.category] || 0) + t.amount;
    }
    for (const b of budgets) {
      const spent = spendByCategory[b.category] || 0;
      const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      if (pct >= 85) {
        attention.push({
          type: 'budget_alert', title: `${b.category} budget`,
          detail: `${pct}% used ($${spent.toFixed(0)}/$${b.amount})`,
          id: b.id,
          severity: pct >= 100 ? 'high' : 'medium',
          action: 'review_budget',
          actionLabel: 'Review',
        });
      }
    }

    // Emails needing reply (recency-filtered)
    for (const e of urgentEmails) {
      const hrs = hoursBetween(new Date(e.date), now);
      attention.push({
        type: 'email_reply', title: e.subject || 'No subject',
        detail: `From ${e.fromName || 'unknown'} · ${hrs}h ago`,
        id: e.id,
        severity: hrs > 48 ? 'high' : 'medium',
        action: 'triage_email',
        actionLabel: 'Triage',
      });
    }

    // Overdue contacts (with multiplier threshold)
    for (const c of contacts) {
      if (!c.catchUpFrequency || !c.lastContactedAt) continue;
      const daysSince = daysBetween(new Date(c.lastContactedAt), now);
      if (daysSince > c.catchUpFrequency * CONTACT_OVERDUE_MULTIPLIER) {
        attention.push({
          type: 'overdue_contact', title: c.name,
          detail: `Last contacted ${daysSince}d ago (every ${c.catchUpFrequency}d)`,
          id: c.id,
          severity: daysSince > c.catchUpFrequency * 2 ? 'high' : 'medium',
          action: 'log_contact',
          actionLabel: 'Reach out',
        });
      }
    }

    // Sort: high severity first, then by type
    attention.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));

    // === TODAY'S MISSION ===
    // Resolve source email subjects for tasks that came from emails
    const emailIds = todayTasks.filter(t => t.sourceEmailId).map(t => t.sourceEmailId as string);
    const sourceEmails = emailIds.length > 0
      ? await prisma.email.findMany({ where: { id: { in: emailIds } }, select: { id: true, subject: true, fromName: true } })
      : [];
    const emailMap = new Map(sourceEmails.map(e => [e.id, e]));

    const mission: {
      needleMover: { title: string; id?: string; reason?: string; sourceEmail?: { subject: string; from?: string } } | null;
      topTasks: { title: string; id: string; priority: string; pillar?: string; sourceEmail?: { subject: string; from?: string }; triageStatus?: string }[];
      focusSummary: string | null;
    } = {
      needleMover: null,
      topTasks: [],
      focusSummary: null,
    };

    const resolveSource = (t: any) => {
      if (!t.sourceEmailId) return undefined;
      const e = emailMap.get(t.sourceEmailId);
      return e ? { subject: e.subject || 'Email', from: e.fromName || undefined } : undefined;
    };

    // Use daily focus if available
    const focusItems = (dailyFocus as any)?.focusItems;
    if (focusItems && Array.isArray(focusItems) && focusItems.length > 0) {
      const topFocus = focusItems[0];
      const linkedTask = topFocus.taskId ? todayTasks.find(t => t.id === topFocus.taskId) : null;
      mission.needleMover = {
        title: topFocus.title,
        id: topFocus.taskId || undefined,
        reason: topFocus.reason,
        sourceEmail: linkedTask ? resolveSource(linkedTask) : undefined,
      };
      mission.focusSummary = (dailyFocus as any)?.aiSummary || null;
    } else {
      // Fallback: find needle mover from today's tasks
      const nm = todayTasks.find(t => t.isNeedleMover);
      if (nm) {
        mission.needleMover = { title: nm.title, id: nm.id, sourceEmail: resolveSource(nm) };
      }
    }

    // Top 3 tasks for today (excluding needle mover)
    const excludeId = mission.needleMover?.id;
    mission.topTasks = todayTasks
      .filter(t => t.id !== excludeId)
      .slice(0, 3)
      .map(t => ({ title: t.title, id: t.id, priority: t.priority, pillar: t.pillar || undefined, sourceEmail: resolveSource(t), triageStatus: t.triageStatus || undefined }));

    // === HABITS STATUS ===
    const todayDateStr = todayStart.toISOString().split('T')[0];
    const habitStatus = habits.map(h => {
      const doneToday = (h.logs || []).some(l => {
        const ld = new Date(l.date);
        return ld.toISOString().split('T')[0] === todayDateStr;
      });
      // Calculate streak
      let streak = 0;
      const sortedLogs = (h.logs || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      for (let i = 0; i < sortedLogs.length; i++) {
        const expected = new Date(now.getTime() - i * 86400000);
        expected.setHours(0, 0, 0, 0);
        const logDate = new Date(sortedLogs[i].date);
        logDate.setHours(0, 0, 0, 0);
        if (logDate.getTime() === expected.getTime()) streak++;
        else break;
      }
      return {
        id: h.id, title: h.title, pillar: h.pillar, doneToday, streak,
      };
    });

    // === MOMENTUM ===
    const habitsDoneToday = habitStatus.filter(h => h.doneToday).length;
    const habitsTotal = habits.length;
    let bestStreak = 0;
    let bestStreakHabit = '';
    for (const h of habitStatus) {
      if (h.streak > bestStreak) { bestStreak = h.streak; bestStreakHabit = h.title; }
    }

    const momentum = {
      tasksCompletedToday: doneTodayTasks.length,
      tasksPendingToday: todayTasks.length,
      habitsDoneToday,
      habitsTotal,
      bestStreak,
      bestStreakHabit,
      goalsProgress: activeGoals.map(g => ({
        id: g.id, title: g.title, pillar: g.pillar,
        progress: g.metricSource && g.target ? Math.round(((g.current || 0) / g.target) * 100) : g.progress,
        target: g.target, current: g.current, unit: g.unit,
      })),
      scoreChange: recentScores.length >= 2 ? {
        current: (recentScores[0] as any).overall,
        previous: (recentScores[1] as any).overall,
        delta: ((recentScores[0] as any).overall || 0) - ((recentScores[1] as any).overall || 0),
      } : null,
    };

    // === IDENTITY ===
    const identity = {
      northStar: profile?.northStar || null,
      mission: profile?.mission || null,
      identity: profile?.identity || null,
      alterEgoName: profile?.alterEgoName || null,
      mantra: (profile as any)?.alterEgoMantra || null,
    };

    // === WEEK AHEAD + TODAY'S SCHEDULE ===
    const todayDateStrSGT = `${sgt.getUTCFullYear()}-${String(sgt.getUTCMonth()+1).padStart(2,'0')}-${String(sgt.getUTCDate()).padStart(2,'0')}`;
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const weekDays: { date: string; dayName: string; isToday: boolean; eventCount: number; taskCount: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartSGT.getTime() + i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const dayStart = d;
      const dayEnd = new Date(d.getTime() + 86400000);
      const evCount = weekEvents.filter(e => {
        const st = new Date(e.startTime);
        return st >= dayStart && st < dayEnd;
      }).length;
      const tkCount = todayTasks.filter(t => {
        if (t.dueDate) { const dd = new Date(t.dueDate).toISOString().split('T')[0]; if (dd === dateStr) return true; }
        return false;
      }).length + (overdueTasks.length > 0 && dateStr === todayDateStrSGT ? overdueTasks.length : 0);
      weekDays.push({
        date: dateStr,
        dayName: dayNames[d.getUTCDay()],
        isToday: dateStr === todayDateStrSGT,
        eventCount: evCount,
        taskCount: tkCount,
      });
    }

    // Today's events (sorted by time) — include CalendarEvents + scheduled tasks
    const calEventsToday = weekEvents
      .filter(e => {
        const st = new Date(e.startTime);
        const stDate = new Date(Date.UTC(st.getUTCFullYear(), st.getUTCMonth(), st.getUTCDate()));
        return stDate.getTime() === todayStart.getTime() || (e.allDay && st >= todayStart && st < tomorrowStart);
      })
      .map(e => ({
        ...e,
        startTime: new Date(e.startTime).toISOString(),
        endTime: e.endTime ? new Date(e.endTime).toISOString() : null,
      }));

    // Scheduled tasks for today
    const scheduledTasksToday = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'done' },
        scheduledStartTime: { gte: todayStart, lt: tomorrowStart },
      },
      select: { id: true, title: true, scheduledStartTime: true, scheduledEndTime: true, status: true, aiUrgency: true, goalId: true },
    });
    const taskEventsToday = scheduledTasksToday.map(t => ({
      id: `task-${t.id}`,
      title: t.title,
      startTime: t.scheduledStartTime!.toISOString(),
      endTime: t.scheduledEndTime ? t.scheduledEndTime.toISOString() : null,
      allDay: false,
      color: t.aiUrgency === 'critical' ? '#ef4444' : t.aiUrgency === 'high' ? '#f59e0b' : '#8b9e83',
      source: 'task',
      taskId: t.id,
    }));

    const todayEvents = [...calEventsToday, ...taskEventsToday].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    // Briefing data from DailyFocus
    const briefing = {
      text: (dailyFocus as any)?.briefingText || null,
      data: (dailyFocus as any)?.briefingData || null,
    };

    return NextResponse.json({
      identity,
      mission: mission,
      habits: habitStatus,
      attention,
      momentum,
      weekDays,
      todayEvents,
      briefing,
      calendarSubs: calSubs,
    });
  } catch (e: any) { return handleApiError(e); }
}
