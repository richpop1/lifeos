export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST AI prioritize all active tasks — goal-weighted, preference-learned, auto-schedule
export async function POST() {
  try {
    const userId = await requireUserId();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const [profile, goals, habits, tasks, latestScore] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { weight: 'desc' } }),
      prisma.habit.findMany({ where: { userId, isActive: true } }),
      prisma.task.findMany({
        where: { userId, status: { not: 'done' } },
        include: { goal: { select: { title: true, pillar: true, type: true, weight: true, isProject: true } } },
      }),
      prisma.lifeScore.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
    ]);

    if (!tasks.length) return NextResponse.json({ message: 'No active tasks to prioritize' });

    const northStar = profile?.northStar || 'Personal freedom and growth';
    const mission = profile?.mission || '';
    const identity = profile?.identity || '';
    const aiPrefs = (profile?.aiPreferences as any) || {};
    const autoCalendar = aiPrefs.autoCalendar === true;
    const userTimezone = aiPrefs.timezone || 'Asia/Singapore';
    const workStartTime = aiPrefs.workStartTime || '09:00';
    const workEndTime = aiPrefs.workEndTime || '18:00';

    // Build preference context from user's saved AI rules
    let prefsCtx = '';
    if (aiPrefs.taskRules?.length) {
      prefsCtx += `\n## USER'S PERSONAL PRIORITIZATION RULES (MUST FOLLOW):\n`;
      aiPrefs.taskRules.forEach((r: string) => { prefsCtx += `- ${r}\n`; });
    }
    if (aiPrefs.priorities?.length) {
      prefsCtx += `\n## USER'S STATED PRIORITIES:\n`;
      aiPrefs.priorities.forEach((p: string) => { prefsCtx += `- ${p}\n`; });
    }
    // Include learned patterns from AI analysis
    const activePatterns = (aiPrefs.learnedPatterns || []).filter((p: any) => p.status === 'active' && (p.category === 'task_preference' || p.category === 'priority_pattern' || p.category === 'productivity_habit'));
    if (activePatterns.length > 0) {
      prefsCtx += `\n## AI-LEARNED PATTERNS (from user behavior analysis):\n`;
      activePatterns.forEach((p: any) => { prefsCtx += `- [${p.confidence}] ${p.pattern}\n`; });
    }

    // Goal context with weights
    const goalsCtx = goals.map((g: any) => 
      `- ${g.title} [${g.pillar || 'general'}, ${g.type}, WEIGHT: ${g.weight}/10${g.isProject ? ', PROJECT' : ''}]`
    ).join('\n');
    const habitsCtx = habits.map((h: any) => `- ${h.title} [${h.pillar || 'general'}]`).join('\n');
    const tasksCtx = tasks.map((t: any, i: number) => {
      const goalInfo = t.goal ? ` → Goal: ${t.goal.title} (weight ${t.goal.weight}/10)` : '';
      const due = t.dueDate ? ` (due: ${new Date(t.dueDate).toISOString().split('T')[0]})` : '';
      const start = t.startDate ? ` (start: ${new Date(t.startDate).toISOString().split('T')[0]})` : '';
      const scheduled = t.scheduledDate ? ` [scheduled: ${new Date(t.scheduledDate).toISOString().split('T')[0]}]` : '';
      const subtaskInfo = t.subtasks ? ` [${(t.subtasks as any[]).filter(s => s.done).length}/${(t.subtasks as any[]).length} subtasks done]` : '';
      return `Task ${i}: "${t.title}" [${t.pillar || 'unassigned'}, priority: ${t.priority}${due}${start}${scheduled}${goalInfo}${subtaskInfo}]`;
    }).join('\n');

    // Weak areas from scores
    let weakAreas = '';
    if (latestScore) {
      const scoreFields = ['activeIncome', 'passiveIncome', 'riskManagement', 'personalBudget',
        'physical', 'emotional', 'mental', 'spiritual', 'partner', 'family', 'friends', 'community'];
      const weak = scoreFields.filter(f => ((latestScore as any)[f] || 5) < 6);
      if (weak.length) weakAreas = `Weak life areas (below 6/10): ${weak.join(', ')}`;
    }

    // Behavioral learning — includes duration learning
    const recentTasks = await prisma.task.findMany({
      where: { userId, status: 'done', aiUrgency: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { title: true, aiUrgency: true, priority: true, pillar: true, goalId: true, estimatedMins: true, actualMins: true },
    });
    let learningCtx = '';
    if (recentTasks.length > 0) {
      learningCtx = `\n## RECENTLY COMPLETED TASKS (learn from what user actually does):\n`;
      recentTasks.slice(0, 10).forEach(t => {
        const dur = t.actualMins ? `actual: ${t.actualMins}min` : (t.estimatedMins ? `est: ${t.estimatedMins}min` : '');
        learningCtx += `- "${t.title}" (AI said ${t.aiUrgency}, user priority: ${t.priority}${dur ? ', ' + dur : ''})\n`;
      });
    }
    // Duration learning: compute average estimation accuracy
    const withBothDurations = recentTasks.filter(t => t.estimatedMins && t.actualMins);
    let durationBias = '';
    if (withBothDurations.length >= 3) {
      const avgRatio = withBothDurations.reduce((acc, t) => acc + (t.actualMins! / t.estimatedMins!), 0) / withBothDurations.length;
      if (avgRatio > 1.3) durationBias = `\nDURATION BIAS: User tasks typically take ${Math.round(avgRatio * 100)}% of estimated time. INCREASE your estimates by ${Math.round((avgRatio - 1) * 100)}%.`;
      else if (avgRatio < 0.7) durationBias = `\nDURATION BIAS: User finishes tasks faster than estimated (${Math.round(avgRatio * 100)}%). DECREASE your estimates.`;
    }

    // Scheduling context
    const scheduleInstructions = autoCalendar ? `
## SCHEDULING INSTRUCTIONS (AUTO-CALENDAR IS ON):
TODAY is ${todayStr}. User's timezone: ${userTimezone}. Work hours: ${workStartTime} to ${workEndTime}.
For each task, suggest a scheduledDate (YYYY-MM-DD) when the user should work on it.
Rules:
- Critical/high urgency → schedule within 1-3 days
- Tasks with existing dueDate → schedule 1-2 days before dueDate
- Tasks with startDate → don't schedule before startDate
- Medium urgency → this week
- Low/defer → next week or later
- Spread tasks across days (max 3-4 tasks per day)
- Don't schedule on weekends unless critical
- If task already has scheduledDate in the future, keep it unless urgency changed
` : `\n(Auto-calendar is OFF — skip scheduledDate, return null for all)`;

    const prompt = `You are an ADHD-optimized productivity coach. Prioritize tasks using GOAL WEIGHTS as primary signal.

NORTH STAR: "${northStar}"
MISSION: "${mission}"
IDENTITY: "${identity}"
${prefsCtx}

GOALS (sorted by weight — higher weight = more important):
${goalsCtx || 'None set'}

HABITS:
${habitsCtx || 'None set'}

${weakAreas}
${learningCtx}
${scheduleInstructions}

TASKS TO PRIORITIZE:
${tasksCtx}

PRIORITIZATION ALGORITHM:
1. Tasks linked to HIGH-WEIGHT goals (8-10) get "critical" or "high"
2. Tasks with approaching deadlines get urgency boost
3. Tasks addressing weak life areas get boosted
4. Tasks linked to LOW-WEIGHT goals (1-3) get "medium" or "low"
5. Unlinked tasks with no deadline = "defer" unless user rules say otherwise
6. USER'S PERSONAL RULES override all other logic
7. Only 1-2 tasks should be "critical" — be ruthless

For EACH task return:
- aiUrgency: "critical" | "high" | "medium" | "low" | "defer"
- northStarAlign: 1-10
- aiRecommendation: Concrete next action in <80 chars
- linkedHabit: habit title if connected, else null
- scheduledDate: "YYYY-MM-DD" or null
- estimatedMins: integer (estimated minutes to complete, 15-480 range)
${durationBias}

Return ONLY valid JSON array: [{"index": 0, "aiUrgency": "...", "northStarAlign": N, "aiRecommendation": "...", "linkedHabit": "..."|null, "scheduledDate": "YYYY-MM-DD"|null, "estimatedMins": N}]`;

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      console.error('[AI PRIORITIZE] API error');
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '';

    let results: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) results = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const habitMap = new Map(habits.map((h: any) => [h.title.toLowerCase(), h.id]));
    const updates = [];

    for (const r of results) {
      const task = tasks[r.index];
      if (!task) continue;
      const linkedHabitId = r.linkedHabit ? (habitMap.get(r.linkedHabit.toLowerCase()) || null) : null;
      const scheduledDate = r.scheduledDate ? new Date(r.scheduledDate) : null;
      const estimatedMins = r.estimatedMins ? Math.min(480, Math.max(15, parseInt(r.estimatedMins))) : null;

      // Calculate start/end times directly on the task
      let scheduledStartTime: Date | null = null;
      let scheduledEndTime: Date | null = null;
      if (autoCalendar && scheduledDate && estimatedMins) {
        scheduledStartTime = getLocalTime(scheduledDate, workStartTime, userTimezone);
        scheduledEndTime = new Date(scheduledStartTime.getTime() + estimatedMins * 60 * 1000);
      }

      updates.push(
        prisma.task.update({
          where: { id: task.id },
          data: {
            aiUrgency: r.aiUrgency,
            northStarAlign: r.northStarAlign,
            aiRecommendation: r.aiRecommendation,
            linkedHabitId,
            scheduledDate,
            estimatedMins,
            scheduledStartTime,
            scheduledEndTime,
          },
        })
      );
    }
    await Promise.all(updates);

    // Clean up old task-sourced CalendarEvents (migrating to task-native scheduling)
    await prisma.calendarEvent.deleteMany({ where: { userId, source: 'task' } });

    const updatedTasks = await prisma.task.findMany({
      where: { userId, status: { not: 'done' } },
      include: { goal: { select: { title: true, pillar: true, weight: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      prioritized: results.length,
      tasks: updatedTasks,
    });
  } catch (e: any) {
    console.error('[AI PRIORITIZE ERROR]', e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: 'Prioritization failed' }, { status: 500 });
  }
}

/** Convert a UTC-midnight date + HH:MM time string in a given timezone to a proper UTC Date */
function getLocalTime(dateUtc: Date, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  // Get the date string in the user's timezone (YYYY-MM-DD)
  const dateInTz = dateUtc.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
  // Create a date string like "2025-01-15T09:00:00" and interpret it in the user's timezone
  const localStr = `${dateInTz}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  // Use Intl to find the UTC offset for this timezone at this datetime
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
  const parts = formatter.formatToParts(dateUtc);
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || '+0';
  // Parse offset like "GMT+8" or "GMT-5:30"
  const match = offsetPart.match(/([+-]?)(\d+)(?::(\d+))?/);
  let offsetMins = 0;
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    offsetMins = sign * (parseInt(match[2]) * 60 + parseInt(match[3] || '0'));
  }
  // Create UTC date by subtracting the offset
  const localDate = new Date(localStr + 'Z'); // treat as UTC first
  return new Date(localDate.getTime() - offsetMins * 60 * 1000);
}
