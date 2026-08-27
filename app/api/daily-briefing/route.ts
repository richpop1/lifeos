export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// Days until a MM-DD date from today's MM-DD (wraps around year)
function daysDiff(todayMD: string, targetMD: string): number {
  const [tm, td] = todayMD.split('-').map(Number);
  const [xm, xd] = targetMD.split('-').map(Number);
  const year = new Date().getFullYear();
  let target = new Date(year, xm - 1, xd);
  const today = new Date(year, tm - 1, td);
  if (target < today) target = new Date(year + 1, xm - 1, xd);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// GET: fetch today's briefing
// POST: generate/regenerate today's briefing
export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    // Use SGT (UTC+8) for "today"
    const sgt = new Date(now.getTime() + 8 * 3600000);
    const todayStart = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate()));

    const focus = await prisma.dailyFocus.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    });

    return NextResponse.json({
      briefingText: focus?.briefingText || null,
      briefingData: focus?.briefingData || null,
      date: todayStart.toISOString(),
    });
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const sgt = new Date(now.getTime() + 8 * 3600000);
    const todayStart = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate()));
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);

    // Gather all data sources
    const [events, tasks, habits, goals, emails, profile, allContacts] = await Promise.all([
      // Today's calendar events
      prisma.calendarEvent.findMany({
        where: { userId, startTime: { gte: todayStart, lt: tomorrowStart } },
        orderBy: { startTime: 'asc' },
      }),
      // Active tasks (due today or overdue)
      prisma.task.findMany({
        where: {
          userId, status: { not: 'done' },
          triageStatus: { notIn: ['dismissed', 'pending'] },
          OR: [
            { dueDate: { lte: tomorrowStart } },
            { scheduledDate: { gte: todayStart, lt: tomorrowStart } },
          ],
        },
        orderBy: [{ isNeedleMover: 'desc' }, { priority: 'asc' }],
        take: 10,
      }),
      // Active habits
      prisma.habit.findMany({
        where: { userId, isActive: true },
        include: { logs: { where: { date: { gte: new Date(now.getTime() - 2 * 86400000) } } } },
      }),
      // Active goals
      prisma.goal.findMany({
        where: { userId, status: 'active' },
        select: { id: true, title: true, target: true, current: true, unit: true, progress: true, pillar: true },
        take: 8,
      }),
      // Recent unread/action-needed emails
      prisma.email.findMany({
        where: {
          userId,
          OR: [
            { isRead: false },
            { aiAction: 'reply_needed', userAction: null },
          ],
          date: { gte: new Date(now.getTime() - 72 * 3600000) },
        },
        select: { id: true, subject: true, fromName: true, aiSummary: true, aiAction: true, isRead: true },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      // Contacts with birthdays for upcoming check
      prisma.contact.findMany({
        where: { userId, isArchived: false, birthday: { not: null } },
        select: { id: true, name: true, birthday: true, phone: true, customDates: true },
      }),
    ]);

    // Build briefing data (structured)
    const todayDateStr = todayStart.toISOString().split('T')[0];
    const briefingData = {
      events: events.map(e => ({
        id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime,
        allDay: e.allDay, location: e.location, source: e.source, color: e.color,
      })),
      tasksDue: tasks.map(t => ({
        id: t.id, title: t.title, priority: t.priority, isNeedleMover: t.isNeedleMover,
        dueDate: t.dueDate, pillar: t.pillar,
      })),
      habitsToday: habits.map(h => {
        const doneToday = h.logs.some(l => new Date(l.date).toISOString().split('T')[0] === todayDateStr);
        return { id: h.id, title: h.title, icon: (h as any).icon, doneToday, streak: 0 };
      }),
      goalUpdates: goals.map(g => ({
        id: g.id, title: g.title, progress: g.target ? Math.round(((g.current || 0) / g.target) * 100) : g.progress,
        pillar: g.pillar,
      })),
      emailAlerts: emails.map(e => ({
        id: e.id, subject: e.subject, from: e.fromName, action: e.aiAction, unread: !e.isRead,
      })),
      upcomingBirthdays: (() => {
        const todayMD = `${String(todayStart.getMonth() + 1).padStart(2, '0')}-${String(todayStart.getDate()).padStart(2, '0')}`;
        const upcoming: { id: string; name: string; date: string; daysUntil: number; occasion: string }[] = [];
        for (const c of allContacts) {
          // Check birthday
          if (c.birthday) {
            const bd = c.birthday.length > 5 ? c.birthday.slice(5) : c.birthday; // YYYY-MM-DD → MM-DD or MM-DD
            const daysUntil = daysDiff(todayMD, bd);
            if (daysUntil >= 0 && daysUntil <= 7) {
              upcoming.push({ id: c.id, name: c.name, date: c.birthday, daysUntil, occasion: 'birthday' });
            }
          }
          // Check custom dates
          const cds = Array.isArray(c.customDates) ? c.customDates as { label: string; date: string }[] : [];
          for (const cd of cds) {
            if (!cd.date) continue;
            const cdMD = cd.date.length > 5 ? cd.date.slice(5) : cd.date;
            const daysUntil = daysDiff(todayMD, cdMD);
            if (daysUntil >= 0 && daysUntil <= 7) {
              upcoming.push({ id: c.id, name: c.name, date: cd.date, daysUntil, occasion: cd.label });
            }
          }
        }
        return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
      })(),
    };

    // Generate AI briefing text
    const apiKey = process.env.ABACUSAI_API_KEY;
    let briefingText = '';

    if (apiKey) {
      const eventsText = events.length > 0
        ? events.map(e => {
            const time = e.allDay ? 'All day' : new Date(e.startTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
            return `- ${time}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`;
          }).join('\n')
        : 'No events scheduled';

      const tasksText = tasks.length > 0
        ? tasks.slice(0, 6).map(t => {
            const flags = [t.isNeedleMover ? '⚡' : '', t.priority === 'high' ? '🔴' : ''].filter(Boolean).join('');
            const overdue = t.dueDate && new Date(t.dueDate) < todayStart ? ' (OVERDUE)' : '';
            return `- ${flags} ${t.title}${overdue}`;
          }).join('\n')
        : 'No tasks due';

      const habitsText = habits.map(h => {
        const done = h.logs.some(l => new Date(l.date).toISOString().split('T')[0] === todayDateStr);
        return `- ${(h as any).icon || '✨'} ${h.title}: ${done ? '✅' : '⬜'}`;
      }).join('\n') || 'No habits';

      const emailText = emails.length > 0
        ? emails.slice(0, 5).map(e => `- ${e.fromName || 'Unknown'}: ${e.subject || 'No subject'} [${e.aiAction || 'unread'}]`).join('\n')
        : 'Inbox clear';

      const prompt = `You are Jarvis, a concise personal AI assistant for ${profile?.alterEgoName || 'the user'}.
North Star: ${profile?.northStar || 'Not set'}

Today is ${new Date(todayStart).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (Singapore time).

SCHEDULE:
${eventsText}

TASKS:
${tasksText}

HABITS:
${habitsText}

EMAILS:
${emailText}

ACTIVE GOALS:
${goals.map(g => `- ${g.title} (${g.progress || 0}%)`).join('\n') || 'None'}

UPCOMING BIRTHDAYS/DATES (this week):
${briefingData.upcomingBirthdays.length > 0 ? briefingData.upcomingBirthdays.map(b => `- ${b.name}'s ${b.occasion}${b.daysUntil === 0 ? ' (TODAY!)' : ` (in ${b.daysUntil} day${b.daysUntil > 1 ? 's' : ''})`}`).join('\n') : 'None'}

Write a crisp morning briefing (3-5 short paragraphs, ~100 words total). Style: direct, warm, motivational but not cheesy. Include:
1. Quick overview of the day's schedule (time-blocked events)
2. Top priority task to tackle first and why
3. Any alerts (overdue items, emails needing reply, streaks at risk)
4. If any birthdays/dates are upcoming this week, mention them warmly
5. One line connecting today's focus to the north star

Do NOT use headers or bullet points. Write in flowing prose paragraphs. Address the user by their name if available.`;

      try {
        const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 800,
            temperature: 0.4,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          briefingText = aiData?.choices?.[0]?.message?.content || '';
        }
      } catch (e) {
        console.error('[DAILY BRIEFING] AI error:', e);
      }
    }

    // Upsert into DailyFocus
    await prisma.dailyFocus.upsert({
      where: { userId_date: { userId, date: todayStart } },
      update: { briefingText, briefingData },
      create: { userId, date: todayStart, focusItems: [], briefingText, briefingData },
    });

    return NextResponse.json({ briefingText, briefingData, date: todayStart.toISOString() });
  } catch (e: any) { return handleApiError(e); }
}