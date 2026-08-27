export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

function getTodayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

// GET — fetch today's daily focus
export async function GET() {
  try {
    const userId = await requireUserId();
    const today = getTodayDate();
    
    const focus = await prisma.dailyFocus.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    
    return NextResponse.json(focus || null);
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

// POST — generate today's daily focus using AI
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const today = getTodayDate();
    const body = await req.json().catch(() => ({}));
    const { regenerate } = body;
    
    // Check if already exists
    const existing = await prisma.dailyFocus.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (existing && !regenerate) {
      return NextResponse.json(existing);
    }
    
    // Fetch context
    const [profile, goals, tasks, habits, recentJournal] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { weight: 'desc' } }),
      prisma.task.findMany({ where: { userId, status: { not: 'done' } }, orderBy: { createdAt: 'desc' }, take: 30, include: { goal: { select: { title: true, weight: true } } } }),
      prisma.habit.findMany({ where: { userId }, include: { logs: { where: { date: { gte: new Date(Date.now() - 7 * 86400000) } }, orderBy: { date: 'desc' } } } }),
      prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 3 }),
    ]);

    // --- OVERDUE TASK REQUEUE ---
    // Find tasks that had a scheduledDate in the past but are still not done
    const overdueTasks = tasks.filter((t: any) => {
      if (t.status === 'done') return false;
      const scheduled = t.scheduledDate ? new Date(t.scheduledDate) : null;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const todayMidnight = new Date(today);
      return (scheduled && scheduled < todayMidnight) || (due && due < todayMidnight);
    });

    const aiPrefs = (profile?.aiPreferences as any) || {};
    const autoCalendar = aiPrefs.autoCalendar === true;

    if (overdueTasks.length > 0 && autoCalendar) {
      // Smart requeue: reschedule overdue tasks based on priority
      const requeueOps = overdueTasks.map((t: any) => {
        const goalWeight = (t.goal as any)?.weight || 5;
        const urgency = t.aiUrgency || t.priority || 'medium';
        // Higher priority = sooner reschedule
        let daysAhead = 1;
        if (urgency === 'critical' || urgency === 'high' || goalWeight >= 8) daysAhead = 0; // today
        else if (urgency === 'medium' || goalWeight >= 5) daysAhead = 1; // tomorrow
        else daysAhead = 2; // day after

        const newDate = new Date(today);
        newDate.setDate(newDate.getDate() + daysAhead);
        // Skip weekends for non-critical
        if (urgency !== 'critical' && newDate.getDay() === 0) newDate.setDate(newDate.getDate() + 1);
        if (urgency !== 'critical' && newDate.getDay() === 6) newDate.setDate(newDate.getDate() + 2);

        return prisma.task.update({
          where: { id: t.id },
          data: { scheduledDate: newDate },
        }).then(() => {
          // Also update the calendar event if exists
          return prisma.calendarEvent.updateMany({
            where: { taskId: t.id, source: 'task', userId },
            data: { startTime: newDate },
          });
        });
      });
      await Promise.all(requeueOps);
      console.log(`[DAILY FOCUS] Requeued ${overdueTasks.length} overdue tasks`);
    }
    
    const northStar = profile?.northStar || 'Personal freedom and growth';
    const goalsText = goals.map((g: any) => `- ${g.title} (${g.pillar || 'general'}, weight: ${g.weight}/10, ${g.progress || 0}%${g.isProject ? ', PROJECT' : ''})`).join('\n');
    const tasksText = tasks.map((t: any) => {
      const urgLabel = t.aiUrgency || t.priority || 'medium';
      const needleMover = t.isNeedleMover ? ' ⚡NEEDLE MOVER' : '';
      const goalLink = t.goal ? ` → goal: ${t.goal.title}` : '';
      const align = t.northStarAlign ? ` (align: ${t.northStarAlign}/10)` : '';
      return `- [${t.id}] ${t.title} | ${urgLabel}${needleMover}${goalLink}${align} | ${t.pillar || 'general'}`;
    }).join('\n');
    
    const habitsText = habits.map((h: any) => {
      const streak = h.logs?.length || 0;
      return `- ${h.title} (streak: ${streak}d)`;
    }).join('\n');
    
    const lastJournal = recentJournal[0];
    const lastContext = lastJournal ? `Last journal: ${lastJournal.dayTitle || 'no title'} | Focus: ${lastJournal.focusItem || 'none'} | Razor: ${lastJournal.focusRazor || 'none'}` : '';
    
    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    
    const prompt = `You are a sharp AI life coach for someone with ADHD. Their North Star is: "${northStar}"

${lastContext}

ACTIVE GOALS:
${goalsText || 'None'}

CURRENT TASKS (not done):
${tasksText || 'None'}

HABITS:
${habitsText || 'None'}

Pick 1-3 things (MAX 3) this person should focus on TODAY. Prioritize:
1. Tasks that are needle movers + high north star alignment
2. Overdue or urgent items
3. Tasks connected to active goals
4. Habits at risk of breaking streaks

For each item, explain in 1 short sentence WHY it matters today.
Also write a 1-line overall summary of "why these items" (connect to north star).

Return ONLY valid JSON:
{
  "items": [
    {"title": "...", "reason": "...", "taskId": "task_id_or_null", "pillar": "wealth|health|relationship|null", "urgency": "critical|high|medium|low"}
  ],
  "summary": "one line connecting these to north star"
}`;
    
    const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });
    
    if (!aiRes.ok) {
      console.error('[DAILY FOCUS] AI error:', await aiRes.text());
      return NextResponse.json({ error: 'AI failed' }, { status: 500 });
    }
    
    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '';
    
    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[DAILY FOCUS] Parse error:', content.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }
    
    if (!parsed?.items?.length) {
      return NextResponse.json({ error: 'AI returned no focus items' }, { status: 500 });
    }
    
    const focus = await prisma.dailyFocus.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        focusItems: parsed.items,
        aiSummary: parsed.summary,
      },
      create: {
        userId,
        date: today,
        focusItems: parsed.items,
        aiSummary: parsed.summary,
      },
    });
    
    return NextResponse.json(focus);
  } catch (e: any) {
    console.error('[DAILY FOCUS ERROR]', e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

// PATCH — update completion or reflection
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const today = getTodayDate();
    const body = await req.json();
    
    const focus = await prisma.dailyFocus.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!focus) return NextResponse.json({ error: 'No focus for today' }, { status: 404 });
    
    const updateData: any = {};
    if (body.completed !== undefined) updateData.completed = body.completed;
    if (body.reflection !== undefined) updateData.reflection = body.reflection;
    
    const updated = await prisma.dailyFocus.update({
      where: { id: focus.id },
      data: updateData,
    });
    
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
