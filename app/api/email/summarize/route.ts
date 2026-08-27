export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — Generate on-demand AI summary for an email/thread
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { emailId } = await req.json();
    if (!emailId) return NextResponse.json({ error: 'Missing emailId' }, { status: 400 });

    const email = await prisma.email.findFirst({ where: { id: emailId, userId } });
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Get thread context if available
    let threadEmails: any[] = [];
    if (email.threadId) {
      threadEmails = await prisma.email.findMany({
        where: { userId, threadId: email.threadId },
        orderBy: { date: 'asc' },
        take: 20,
      });
    } else {
      threadEmails = [email];
    }

    // Get user goals for context
    const profile = await prisma.userProfile.findFirst({ where: { userId } });
    const goals = await prisma.goal.findMany({ where: { userId }, take: 5 });
    const northStar = profile?.northStar || '';
    const goalsList = goals.map(g => g.title).join(', ');

    // Fetch learning from user's past actions on similar emails
    const senderActions = await prisma.email.findMany({
      where: { userId, fromAddress: email.fromAddress, userAction: { not: null } },
      orderBy: { userActionAt: 'desc' },
      take: 5,
      select: { subject: true, userAction: true },
    });
    let senderHint = '';
    if (senderActions.length > 0) {
      const actions = senderActions.map(a => a.userAction);
      const most = actions.sort((a, b) => actions.filter(x => x === b).length - actions.filter(x => x === a).length)[0];
      senderHint = `\nUser typically does "${most}" with emails from this sender (${senderActions.length} past actions).`;
    }

    // Build prompt for detailed summary
    const threadDesc = threadEmails.map((e, i) => {
      const body = e.bodyText?.substring(0, 600) || '';
      return `[${i + 1}] From: ${e.fromName || e.fromAddress} | To: ${e.toAddress} | Date: ${e.date}\nSubject: ${e.subject}\n${body}`;
    }).join('\n---\n');

    const prompt = `You are an AI assistant for **Teo Xuan Hao** ("XH"). Provide a detailed analysis of this email thread.

Context: XH's North Star: "${northStar}". Goals: ${goalsList || 'None'}.${senderHint}

Email thread (${threadEmails.length} message${threadEmails.length > 1 ? 's' : ''}):
${threadDesc}

Provide a JSON response with:
{
  "summary": "2-3 sentence summary of what this thread is about, key context, and current status",
  "pendingDecisions": "What decisions or actions are pending, and by whom (be specific with names)",
  "recommendation": "Your recommendation: delete, archive, reply, or create task — and WHY",
  "urgency": "critical|high|medium|low",
  "category": "action-required|fyi|newsletter|personal|finance|promotional|travel",
  "northStarAlign": 1-10,
  "draftReply": "If reply is recommended, draft a concise reply. Otherwise null."
}

Return ONLY valid JSON.`;

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let parsed: any = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { summary: raw.substring(0, 300), recommendation: 'Review manually' };
    }

    // Build rich summary text
    const richSummary = [
      parsed.summary || '',
      parsed.pendingDecisions ? `⏳ Pending: ${parsed.pendingDecisions}` : '',
      parsed.recommendation ? `💡 Recommendation: ${parsed.recommendation}` : '',
    ].filter(Boolean).join('\n');

    // Determine action from recommendation
    let aiAction = email.aiAction;
    if (!aiAction && parsed.recommendation) {
      const rec = parsed.recommendation.toLowerCase();
      if (rec.includes('delete')) aiAction = 'delete';
      else if (rec.includes('archive')) aiAction = 'archive';
      else if (rec.includes('reply')) aiAction = 'reply_needed';
      else if (rec.includes('task')) aiAction = 'add_task';
    }

    // Save to all emails in thread
    const updateData: any = {
      aiSummary: richSummary,
      aiUrgency: parsed.urgency || 'low',
      aiCategory: parsed.category || 'fyi',
      northStarAlign: parsed.northStarAlign || null,
    };
    if (aiAction) updateData.aiAction = aiAction;
    if (parsed.draftReply && parsed.draftReply !== 'null') updateData.aiDraftReply = parsed.draftReply;

    // Update the current email (use updateMany to avoid P2025 if deleted concurrently)
    await prisma.email.updateMany({ where: { id: email.id, userId }, data: updateData });

    // Also update thread siblings if they lack summaries
    if (email.threadId && threadEmails.length > 1) {
      await prisma.email.updateMany({
        where: { userId, threadId: email.threadId, aiSummary: null, id: { not: email.id } },
        data: updateData,
      });
    }

    return NextResponse.json({
      summary: richSummary,
      pendingDecisions: parsed.pendingDecisions || null,
      recommendation: parsed.recommendation || null,
      urgency: parsed.urgency || 'low',
      category: parsed.category || 'fyi',
      action: aiAction,
      draftReply: parsed.draftReply || null,
      northStarAlign: parsed.northStarAlign || null,
    });
  } catch (e: any) { return handleApiError(e); }
}
