export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — fetch active insights
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const all = url.searchParams.get('all') === 'true';
    
    const insights = await prisma.insight.findMany({
      where: {
        userId,
        ...(all ? {} : { isDismissed: false }),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });

    return NextResponse.json(insights);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST — generate insights from current data
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    // Gather comprehensive data
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [profile, latestScore, prevScore, goals, tasks, habits, monthTxns, contacts, recentEntries, investments, budgets] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.lifeScore.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.lifeScore.findFirst({ where: { userId }, orderBy: { date: 'desc' }, skip: 1 }),
      prisma.goal.findMany({ where: { userId, status: 'active' } }),
      prisma.task.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.habit.findMany({ where: { userId, isActive: true }, include: { logs: { where: { date: { gte: weekAgo } }, orderBy: { date: 'desc' } } } }),
      prisma.transaction.findMany({ where: { userId, date: { gte: monthStart } } }),
      prisma.contact.findMany({ where: { userId, isArchived: false }, select: { id: true, name: true, relationship: true, catchUpFrequency: true, lastContactedAt: true, isFavorite: true } }),
      prisma.journalEntry.findMany({ where: { userId, date: { gte: weekAgo } }, orderBy: { date: 'desc' }, select: { date: true, moodStart: true, moodEnd: true, energy: true, dayTitle: true, razorSummary: true, signal: true, focusItem: true, keyMemories: true } }),
      prisma.investment.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
    ]);

    // Build comprehensive context for LLM
    const STAT_LABELS: Record<string, string> = {
      activeIncome: 'Active Income', passiveIncome: 'Passive Income', riskManagement: 'Risk Mgmt', personalBudget: 'Budget',
      physical: 'Physical', emotional: 'Emotional', mental: 'Mental', spiritual: 'Spiritual',
      partner: 'Partner', family: 'Family', friends: 'Friends', community: 'Community',
    };

    const scoreContext = latestScore ? Object.entries(STAT_LABELS).map(([k, l]) => {
      const curr = (latestScore as any)[k] ?? 5;
      const prev = prevScore ? (prevScore as any)[k] ?? 5 : curr;
      const trend = curr > prev ? '↑' : curr < prev ? '↓' : '→';
      return `${l}: ${curr}/10 ${trend}`;
    }).join(', ') : 'No life scores recorded';

    const habitContext = habits.map(h => {
      const daysLogged = h.logs?.length || 0;
      return `${h.title}: ${daysLogged}/7 days this week`;
    }).join(', ') || 'No habits';

    const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const spendingByCategory = monthTxns.filter(t => t.type === 'expense').reduce((acc: Record<string, number>, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount; return acc;
    }, {});
    const topSpending = Object.entries(spendingByCategory).sort(([,a], [,b]) => b - a).slice(0, 5).map(([c, v]) => `${c}: $${v.toFixed(0)}`).join(', ');

    const netWorth = investments.reduce((s, i) => s + (i.value ?? 0), 0);

    const overdueContacts = contacts.filter(c => {
      if (!c.catchUpFrequency || !c.lastContactedAt) return false;
      const daysSince = Math.floor((now.getTime() - new Date(c.lastContactedAt).getTime()) / 86400000);
      return daysSince > c.catchUpFrequency;
    });

    const openTasks = tasks.filter(t => t.status !== 'done');
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
    const completedThisWeek = tasks.filter(t => t.status === 'done' && t.updatedAt && new Date(t.updatedAt) >= weekAgo).length;

    const journalMoods = recentEntries.map(e => `${new Date(e.date).toLocaleDateString('en-SG', {weekday:'short'})}: ${e.moodStart}→${e.moodEnd} (energy:${e.energy || '?'}) ${e.dayTitle || ''}`).join('\n');

    const budgetAlerts = budgets.map(b => {
      const spent = spendingByCategory[b.category] || 0;
      const pct = b.amount > 0 ? (spent / b.amount * 100) : 0;
      return pct > 80 ? `${b.category}: $${spent.toFixed(0)}/$${b.amount.toFixed(0)} (${pct.toFixed(0)}%)` : null;
    }).filter(Boolean);

    const analysisPrompt = `You are a personal life analyst for a Life OS app. Analyze this user's data across ALL life areas and generate actionable insights.

USER CONTEXT:
North Star: ${profile?.northStar || 'Not set'}
Mission: ${profile?.mission || 'Not set'}

LIFE SCORES: ${scoreContext}

GOALS (active): ${goals.map(g => `${g.title} — ${g.progress}% done [${g.pillar || 'general'}]`).join(', ') || 'None'}

TASKS: ${openTasks.length} open, ${overdueTasks.length} overdue, ${completedThisWeek} completed this week
${overdueTasks.length > 0 ? `Overdue: ${overdueTasks.map(t => t.title).join(', ')}` : ''}

HABITS (7-day): ${habitContext}

FINANCE:
- Month: $${monthIncome.toFixed(0)} income / $${monthExpense.toFixed(0)} expense = ${monthIncome > monthExpense ? 'surplus' : 'deficit'} $${Math.abs(monthIncome - monthExpense).toFixed(0)}
- Top spending: ${topSpending || 'No data'}
- Net worth: $${netWorth.toFixed(0)}
${budgetAlerts.length > 0 ? `- Budget alerts: ${budgetAlerts.join(', ')}` : ''}

RELATIONSHIPS:
- ${contacts.length} contacts, ${overdueContacts.length} overdue for catch-up
${overdueContacts.length > 0 ? `Overdue: ${overdueContacts.map(c => `${c.name} (${c.relationship})`).join(', ')}` : ''}

JOURNAL (last 7 days):
${journalMoods || 'No entries this week'}
${recentEntries.map(e => e.signal ? `Signal: ${e.signal}` : '').filter(Boolean).join('\n')}

Generate 3-6 insights. Each must be cross-module (connect dots between different areas) and actionable. Respond with JSON array:
[
  {
    "type": "pattern|nudge|warning|opportunity|streak",
    "category": "health|wealth|relationship|productivity",
    "title": "Short attention-grabbing title (max 8 words)",
    "body": "2-3 sentence insight that connects dots across life areas. Be specific with numbers/names. End with a concrete suggestion.",
    "priority": 1-5
  }
]

Rules:
- Be DIRECT and specific. Use actual names, numbers, dates.
- Connect different life areas (e.g., spending pattern + goal, mood trend + habit streak)
- Prioritize warnings (things going wrong) over opportunities
- Don't be generic. "Exercise more" is useless. "Your physical score dropped from 7 to 5 while your gym habit went from 5/7 to 2/7 days — the correlation is clear" is useful.
- If data is sparse, acknowledge it and suggest what to track.`;

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: analysisPrompt }],
        max_tokens: 1500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('Insight generation failed:', await response.text().catch(() => ''));
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '[]';
    let insights: any[] = [];
    try {
      const parsed = JSON.parse(content);
      insights = Array.isArray(parsed) ? parsed : (parsed.insights || parsed.data || []);
    } catch { insights = []; }

    // Expire old unread insights before creating new ones
    await prisma.insight.updateMany({
      where: { userId, isDismissed: false, createdAt: { lt: weekAgo } },
      data: { isDismissed: true },
    });

    // Save new insights
    const created = [];
    for (const insight of insights) {
      if (!insight.title || !insight.body) continue;
      const saved = await prisma.insight.create({
        data: {
          userId,
          type: insight.type || 'nudge',
          category: insight.category || 'productivity',
          title: insight.title,
          body: insight.body,
          priority: insight.priority || 3,
          expiresAt: new Date(now.getTime() + 7 * 86400000),
        },
      });
      created.push(saved);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
