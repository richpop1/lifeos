export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — Analyze user behavior patterns and generate learned insights
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const force = body.force === true; // force re-analysis even if recent

    // Get profile with current preferences
    const profile = await prisma.userProfile.findFirst({ where: { userId } });
    const aiPrefs = (profile?.aiPreferences as any) || {};
    const lastLearned = aiPrefs.lastLearnedAt ? new Date(aiPrefs.lastLearnedAt) : null;

    // Don't re-learn if analyzed within the last 6 hours (unless forced)
    if (!force && lastLearned && Date.now() - lastLearned.getTime() < 6 * 60 * 60 * 1000) {
      return NextResponse.json({ skipped: true, reason: 'Recently analyzed', learnedPatterns: aiPrefs.learnedPatterns || [] });
    }

    // ── Gather behavioral data ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Triage patterns: which AI-suggested tasks were accepted vs dismissed
    const triageTasks = await prisma.task.findMany({
      where: {
        userId,
        triageStatus: { in: ['accepted', 'dismissed'] },
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: { title: true, pillar: true, triageStatus: true, aiUrgency: true, resolution: true, goalId: true, goal: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    // 2. Task resolution patterns: how tasks are typically resolved
    const resolvedTasks = await prisma.task.findMany({
      where: {
        userId,
        resolution: { not: null },
        resolvedAt: { gte: thirtyDaysAgo },
      },
      select: { title: true, pillar: true, resolution: true, resolvedReason: true, aiUrgency: true, contributionType: true, isNeedleMover: true, goal: { select: { title: true } } },
      orderBy: { resolvedAt: 'desc' },
      take: 100,
    });

    // 3. Email behavior patterns (overrides)
    const emailActions = await prisma.email.findMany({
      where: {
        userId,
        userAction: { not: null },
        date: { gte: thirtyDaysAgo },
      },
      select: { fromName: true, fromAddress: true, subject: true, aiAction: true, userAction: true },
      orderBy: { date: 'desc' },
      take: 150,
    });

    // 4. Task completion timing patterns
    const completedTasks = await prisma.task.findMany({
      where: {
        userId,
        status: 'done',
        resolvedAt: { gte: thirtyDaysAgo },
      },
      select: { title: true, pillar: true, resolvedAt: true, createdAt: true, aiUrgency: true, isNeedleMover: true },
      orderBy: { resolvedAt: 'desc' },
      take: 80,
    });

    // 5. Goals for context
    const goals = await prisma.goal.findMany({
      where: { userId, status: 'active' },
      select: { title: true, pillar: true, weight: true },
    });

    // If insufficient data, return early
    const totalSignals = triageTasks.length + resolvedTasks.length + emailActions.length;
    if (totalSignals < 5) {
      return NextResponse.json({ skipped: true, reason: 'Not enough data yet', signalCount: totalSignals, learnedPatterns: aiPrefs.learnedPatterns || [] });
    }

    // ── Build analysis prompt ──
    const triageSummary = triageTasks.length > 0
      ? `TRIAGE DECISIONS (${triageTasks.length} tasks):\n${triageTasks.map(t =>
          `- "${t.title}" [${t.pillar || 'no pillar'}${t.goal ? `, goal: ${t.goal.title}` : ''}] → ${t.triageStatus}${t.resolution ? ` (${t.resolution})` : ''}`
        ).join('\n')}`
      : '';

    const resolutionSummary = resolvedTasks.length > 0
      ? `TASK RESOLUTIONS (${resolvedTasks.length} tasks):\n${resolvedTasks.map(t =>
          `- "${t.title}" [${t.pillar || 'no pillar'}${t.goal ? `, goal: ${t.goal.title}` : ''}] → ${t.resolution}${t.resolvedReason ? `: ${t.resolvedReason}` : ''}${t.contributionType ? ` (${t.contributionType})` : ''}`
        ).join('\n')}`
      : '';

    const emailOverrides = emailActions.filter(e => e.aiAction && e.userAction && e.aiAction !== e.userAction);
    const emailSummary = emailOverrides.length > 0
      ? `EMAIL CORRECTIONS (${emailOverrides.length} overrides):\n${emailOverrides.slice(0, 30).map(e =>
          `- From "${e.fromName || e.fromAddress}": "${e.subject?.substring(0, 60)}" — AI: ${e.aiAction} → User: ${e.userAction}`
        ).join('\n')}`
      : '';

    // Completion time analysis
    let timingSummary = '';
    if (completedTasks.length >= 5) {
      const dayBuckets: Record<string, number> = {};
      const hourBuckets: Record<number, number> = {};
      for (const t of completedTasks) {
        if (t.resolvedAt) {
          const d = new Date(t.resolvedAt);
          const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
          dayBuckets[day] = (dayBuckets[day] || 0) + 1;
          const h = (d.getUTCHours() + 8) % 24; // SGT
          hourBuckets[h] = (hourBuckets[h] || 0) + 1;
        }
      }
      const topDays = Object.entries(dayBuckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, c]) => `${d}(${c})`).join(', ');
      const topHours = Object.entries(hourBuckets).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3).map(([h, c]) => `${h}:00(${c})`).join(', ');
      timingSummary = `PRODUCTIVITY PATTERNS:\n- Most productive days: ${topDays}\n- Most active hours (SGT): ${topHours}\n- Avg days to complete: ${Math.round(completedTasks.reduce((s, t) => s + ((t.resolvedAt?.getTime() || 0) - t.createdAt.getTime()) / 86400000, 0) / completedTasks.length)}`;
    }

    const currentRules = [
      ...(aiPrefs.taskRules || []).map((r: string) => `Task rule: ${r}`),
      ...(aiPrefs.emailRules || []).map((r: string) => `Email rule: ${r}`),
      ...(aiPrefs.priorities || []).map((r: string) => `Priority: ${r}`),
    ];

    const existingPatterns = aiPrefs.learnedPatterns || [];

    const prompt = `You are an AI learning engine for a personal life OS. Analyze the user's behavior patterns and extract actionable insights.

User's North Star: ${profile?.northStar || 'Not set'}
User's Active Goals: ${goals.map(g => `${g.title} (${g.pillar}, weight: ${g.weight})`).join(', ') || 'None'}
${currentRules.length > 0 ? `\nCurrent explicit rules:\n${currentRules.map(r => `- ${r}`).join('\n')}` : ''}
${existingPatterns.length > 0 ? `\nPreviously learned patterns (update/replace if new data contradicts):\n${existingPatterns.map((p: any) => `- [${p.category}] ${p.pattern} (confidence: ${p.confidence})`).join('\n')}` : ''}

--- BEHAVIORAL DATA ---
${triageSummary}
${resolutionSummary}
${emailSummary}
${timingSummary}

--- INSTRUCTIONS ---
Analyze the data above and extract PATTERNS the AI should learn. For each pattern:
1. Identify what the user consistently does (at least 2-3 examples supporting it)
2. Determine confidence (high: 5+ supporting signals, medium: 3-4, low: 2)
3. Categorize: task_preference, email_preference, productivity_habit, triage_preference, priority_pattern
4. Write a clear, actionable rule the AI can follow
5. Provide a short user-facing explanation

Do NOT repeat patterns already in the user's explicit rules.
Do NOT generate patterns with fewer than 2 supporting data points.
Update confidence of existing learned patterns based on new data.
Remove previously learned patterns that are now contradicted by data.

Respond with raw JSON only:
{
  "patterns": [
    {
      "id": "unique_short_id",
      "category": "task_preference|email_preference|productivity_habit|triage_preference|priority_pattern",
      "pattern": "The actionable rule for AI (internal)",
      "explanation": "Short user-facing explanation of what was learned",
      "confidence": "high|medium|low",
      "signals": 5,
      "examples": ["brief example 1", "brief example 2"]
    }
  ],
  "summary": "1-2 sentence summary of what changed since last analysis"
}`;

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('[AI-LEARN] LLM call failed:', response.status);
      return NextResponse.json({ error: 'Learning analysis failed' }, { status: 500 });
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No analysis returned' }, { status: 500 });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      console.error('[AI-LEARN] Failed to parse LLM response:', content);
      return NextResponse.json({ error: 'Invalid analysis format' }, { status: 500 });
    }

    const learnedPatterns = (result.patterns || []).map((p: any) => ({
      ...p,
      learnedAt: new Date().toISOString(),
      status: 'active', // active | rejected_by_user
    }));

    // Save to profile
    await prisma.userProfile.update({
      where: { id: profile!.id },
      data: {
        aiPreferences: {
          ...aiPrefs,
          learnedPatterns,
          lastLearnedAt: new Date().toISOString(),
          learningStats: {
            totalSignals: totalSignals,
            triageDecisions: triageTasks.length,
            taskResolutions: resolvedTasks.length,
            emailOverrides: emailOverrides.length,
            lastAnalyzedAt: new Date().toISOString(),
          },
        },
      },
    });

    return NextResponse.json({
      patterns: learnedPatterns,
      summary: result.summary || 'Analysis complete',
      stats: {
        totalSignals,
        triageDecisions: triageTasks.length,
        taskResolutions: resolvedTasks.length,
        emailOverrides: emailOverrides.length,
      },
    });
  } catch (e: any) { return handleApiError(e); }
}

// GET — fetch current learned patterns
export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await prisma.userProfile.findFirst({ where: { userId } });
    const aiPrefs = (profile?.aiPreferences as any) || {};

    return NextResponse.json({
      patterns: (aiPrefs.learnedPatterns || []).filter((p: any) => p.status !== 'rejected_by_user'),
      stats: aiPrefs.learningStats || null,
      lastLearnedAt: aiPrefs.lastLearnedAt || null,
    });
  } catch (e: any) { return handleApiError(e); }
}

// PATCH — accept or reject a learned pattern
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const { patternId, action } = await req.json(); // action: 'reject' | 'promote'

    const profile = await prisma.userProfile.findFirst({ where: { userId } });
    const aiPrefs = (profile?.aiPreferences as any) || {};
    const patterns = aiPrefs.learnedPatterns || [];

    if (action === 'reject') {
      // Mark as rejected so it won't be shown or used
      const updated = patterns.map((p: any) => p.id === patternId ? { ...p, status: 'rejected_by_user' } : p);
      await prisma.userProfile.update({
        where: { id: profile!.id },
        data: { aiPreferences: { ...aiPrefs, learnedPatterns: updated } },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'promote') {
      // Move learned pattern into explicit rules
      const pattern = patterns.find((p: any) => p.id === patternId);
      if (!pattern) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });

      const field = pattern.category === 'email_preference' ? 'emailRules' : 'taskRules';
      const rules = [...(aiPrefs[field] || []), pattern.pattern];
      const updatedPatterns = patterns.filter((p: any) => p.id !== patternId); // Remove from learned

      await prisma.userProfile.update({
        where: { id: profile!.id },
        data: { aiPreferences: { ...aiPrefs, [field]: rules, learnedPatterns: updatedPatterns } },
      });
      return NextResponse.json({ success: true, promoted: true, field });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) { return handleApiError(e); }
}
