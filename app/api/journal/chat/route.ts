export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

function buildSystemPrompt(
  sessionType: 'morning' | 'evening',
  context: {
    profile: any;
    scores: any;
    weakAreas: { key: string; label: string; value: number }[];
    goals: any[];
    tasks: any[];
    habits: any[];
    financeSummary: any;
    recentEntries: any[];
  }
) {
  const { profile, scores, weakAreas, goals, tasks, habits, financeSummary, recentEntries } = context;
  const northStar = profile?.northStar || 'Freedom to say no → built by removing myself from operations';
  const alterEgo = profile?.alterEgoName || null;
  const mission = profile?.mission || '';
  const identity = profile?.identity || '';

  const activeGoals = goals.filter((g: any) => g.status === 'active').slice(0, 5);
  const needleMovers = tasks.filter((t: any) => t.isNeedleMover && t.status !== 'done').slice(0, 5);
  const overdueTasks = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').slice(0, 3);
  const todayHabits = habits.slice(0, 8);

  const lastEntry = recentEntries?.[0];
  const lastDayTitle = lastEntry?.dayTitle || null;
  const lastSignal = lastEntry?.signal || null;
  const lastRazor = lastEntry?.focusRazor || null;

  let systemPrompt = `You are a sharp, direct performance coach embedded in a personal operating system called Life OS. You are NOT a therapist, motivational speaker, or gratitude journal. You are a razor-focused accountability partner.

Your tone:
- Direct but not cruel
- Sharp clarity, not fake positivity
- Challenge excuses and inconsistencies
- Never blindly agree
- Short responses — max 2-3 sentences per message unless the user writes a long response
- Use operational language, not emotional fluff
- Act like a conversation with a sharper future version of the user

Critical rules:
- ONE focus only. If the user tries to stack multiple things, call it out.
- Define "done" clearly. Convert vague ambition into observable completion.
- Every day needs a razor — a behavioral constraint that cuts distraction.
- Never confuse exhaustion with truth.
- Systems beat emotion.
- Energy is leverage.

## USER CONTEXT

🎯 NORTH STAR: ${northStar}
${mission ? `📋 MISSION: ${mission}` : ''}
${identity ? `🪞 IDENTITY: ${identity}` : ''}
${alterEgo ? `⚡ ALTER EGO: ${alterEgo} — ${profile?.alterEgoDescription || 'Their aspirational self'}\n   Mantra: "${profile?.alterEgoMantra || ''}"` : ''}

## CURRENT LIFE SCORES (latest)
${weakAreas.length > 0 ? `🔴 WEAKEST AREAS: ${weakAreas.map(w => `${w.label} (${w.value}/10)`).join(', ')}` : 'No scores recorded yet.'}

## ACTIVE GOALS
${activeGoals.length > 0 ? activeGoals.map((g: any) => `- ${g.title} [${g.pillar || 'general'}] ${g.progress}% done`).join('\n') : 'No active goals.'}

## NEEDLE MOVERS (high-impact tasks)
${needleMovers.length > 0 ? needleMovers.map((t: any) => `- ${t.title} [${t.status}]`).join('\n') : 'None set.'}
${overdueTasks.length > 0 ? `\n⚠️ OVERDUE: ${overdueTasks.map((t: any) => t.title).join(', ')}` : ''}

## HABITS TODAY
${todayHabits.length > 0 ? todayHabits.map((h: any) => {
  const todayDone = h.logs?.some((l: any) => {
    const ld = new Date(l.date).toDateString();
    return ld === new Date().toDateString();
  });
  return `- ${todayDone ? '✅' : '⬜'} ${h.title}`;
}).join('\n') : 'No habits tracked.'}

## FINANCIAL SNAPSHOT
${financeSummary ? `Month: SGD ${financeSummary.monthIncome?.toFixed(0) || 0} in / SGD ${financeSummary.monthExpense?.toFixed(0) || 0} out | Net Worth: SGD ${financeSummary.netWorth?.toFixed(0) || 0}` : 'No financial data.'}

## PREVIOUS SESSION
${lastDayTitle ? `Last day title: "${lastDayTitle}"` : ''}
${lastSignal ? `Last signal: "${lastSignal}"` : ''}
${lastRazor ? `Last razor: "${lastRazor}"` : ''}
`;

  if (sessionType === 'morning') {
    systemPrompt += `
## MORNING SESSION FLOW
Guide the user through these steps ONE AT A TIME. Ask one question, wait for their answer, then move to the next. Do NOT dump all questions at once.

1. ENERGY CHECK: Ask how their energy level is (1-5). Brief.
2. TODAY'S FOCUS: Present the AI-suggested focus items (if available below) and ask: "Here's what I think matters most today — does this feel right, or do you want to swap anything?" Let them confirm or adjust.
3. CLEAN WIN: "What does 'done' look like for your #1 focus item?" — Make it observable, not vague.
4. FOCUS RAZOR: "What must you actively ignore today?" — Create a behavioral constraint.
5. EXECUTION CUE: End with a sharp one-liner. No more questions. Examples: "Stop thinking. Start the first rep." or "Ugly but working beats pretty but incomplete."

Start by greeting briefly (reference their alter ego if they have one, and the north star), then ask the energy check. Keep it moving. No fluff.

IMPORTANT: After each user response, acknowledge briefly (1 sentence max), then ask the next question. When you reach step 5, deliver the execution cue and say "Go execute. We'll name the day tonight." — that signals session end.
`;
  } else {
    systemPrompt += `
## EVENING SESSION FLOW
Guide the user through these steps ONE AT A TIME:

1. ENERGY CHECK: Ask their ending energy (1-5).
2. FOCUS REVIEW: Reference today's focus items (if available below). Ask: "How did you do on your focus items?" Check off what was completed, note what wasn't.
3. DAY TITLE: "Give today a title." — Short, emotionally accurate, memorable.
4. REALITY: "What did you actually do vs. what you planned?" — Be direct about gaps.
5. ONE SIGNAL: "One thing worth noticing?" — A pattern, friction, warning, or opportunity.
6. PERSONAL MIRROR: "Owned or carried?" — Did they choose or react today?
7. DAILY LINE: "One sentence worth rereading months later."

Start by greeting and asking the energy check. Keep responses tight. When you reach step 7, acknowledge the daily line and say "Day recorded. Rest well." — that signals session end.

IMPORTANT: If the user mentions exhaustion or emotional strain, make the session lighter. Fewer questions. Don't push hard on bad days — the system survives by adapting.
`;
  }

  return systemPrompt;
}

function buildFocusContext(dailyFocus: any): string {
  if (!dailyFocus?.focusItems) return '';
  const items = dailyFocus.focusItems as any[];
  const completed = (dailyFocus.completed || []) as any[];
  const completedIdxs = new Set(completed.map((c: any) => c.index));
  const lines = items.map((item: any, idx: number) => {
    const status = completedIdxs.has(idx) ? '✅' : '⬜';
    return `${status} ${item.title} — ${item.reason}`;
  });
  return `\n## TODAY'S AI-SELECTED FOCUS ITEMS\n${lines.join('\n')}\n${dailyFocus.aiSummary ? `Why: ${dailyFocus.aiSummary}` : ''}`;
}

const STAT_LABELS: Record<string, string> = {
  activeIncome: 'Active Income', passiveIncome: 'Passive Income',
  riskManagement: 'Risk Management', personalBudget: 'Budget Discipline',
  physical: 'Physical Health', emotional: 'Emotional Wellbeing',
  mental: 'Focus & Mental Clarity', spiritual: 'Spiritual Practice',
  partner: 'Partner Relationship', family: 'Family Connection',
  friends: 'Friendships', community: 'Community Involvement',
};

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { messages, sessionType, isContinuation } = body;

    // Fetch all context including daily focus
    const today = new Date();
    const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const [profile, latestScore, goals, tasks, habits, financeSummary, recentEntries, dailyFocus, contacts] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.lifeScore.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.goal.findMany({ where: { userId, status: 'active' }, take: 10 }),
      prisma.task.findMany({ where: { userId, status: { not: 'done' } }, take: 20 }),
      prisma.habit.findMany({
        where: { userId, isActive: true },
        include: { logs: { where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } } },
      }),
      (async () => {
        try {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthTxns = await prisma.transaction.findMany({ where: { userId, date: { gte: startOfMonth } } });
          const investments = await prisma.investment.findMany({ where: { userId } });
          return {
            monthIncome: monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
            monthExpense: monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
            netWorth: investments.reduce((s, i) => s + (i.value ?? 0), 0),
          };
        } catch { return null; }
      })(),
      prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 3 }),
      prisma.dailyFocus.findUnique({ where: { userId_date: { userId, date: todayDate } } }),
      prisma.contact.findMany({ where: { userId, isArchived: false }, select: { name: true, nickname: true, relationship: true }, take: 50 }),
    ]);

    // Compute weak areas
    const weakAreas: { key: string; label: string; value: number }[] = [];
    if (latestScore) {
      const all = Object.entries(STAT_LABELS).map(([key, label]) => ({
        key, label, value: (latestScore as any)?.[key] ?? 5,
      }));
      all.sort((a, b) => a.value - b.value);
      weakAreas.push(...all.slice(0, 3));
    }

    let systemMessage = buildSystemPrompt(sessionType, {
      profile, scores: latestScore, weakAreas, goals, tasks, habits, financeSummary, recentEntries,
    });
    // Append daily focus context
    const focusCtx = buildFocusContext(dailyFocus);
    if (focusCtx) systemMessage += focusCtx;

    // If continuation, inject continuation instructions
    if (isContinuation) {
      systemMessage += `\n\n## CONTINUATION MODE\nThis is a CONTINUATION of an earlier journal session from the same day. The user is coming back to add more to their entry.\n\nIMPORTANT RULES:\n- You can see the earlier conversation in the message history above.\n- Do NOT re-ask questions that were already answered.\n- Greet them back warmly but briefly (e.g. "Welcome back. What happened since we last talked?")\n- Ask about what's new or what changed since the earlier session.\n- Keep it conversational — let them share what's on their mind.\n- When they seem done, wrap up naturally with a closing line like the normal flow.\n- The final summary will cover EVERYTHING — both the earlier session and this continuation.`;
    }

    // Append contacts context for @mention awareness
    if (contacts && contacts.length > 0) {
      const contactNames = contacts.map((c: any) => {
        let label = c.name;
        if (c.nickname) label += ` (${c.nickname})`;
        return `${label} [${c.relationship}]`;
      }).join(', ');
      systemMessage += `\n\n## PEOPLE IN THEIR LIFE\nThe user has these contacts saved: ${contactNames}\n\nIf the user mentions any of these people (by name, @mention, or naturally), acknowledge them. The system will automatically detect mentions and link journal insights to their contact profiles. Encourage the user to share stories about people — it makes the journal richer.`;
    }

    const apiMessages = [
      { role: 'system', content: systemMessage },
      ...(messages || []),
    ];

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: apiMessages,
        stream: true,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      console.error('LLM API error:', err);
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
