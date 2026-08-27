export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST AI triage — smart actions: categorize, recommend actions, draft replies
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { emailIds, mode = 'triage' } = body; // mode: 'triage' | 'full_autopilot'

    if (!emailIds?.length) return NextResponse.json({ error: 'No emails to triage' }, { status: 400 });

    // Fetch user context
    const [profile, goals, tasks, emails] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.goal.findMany({ where: { userId, status: 'active' } }),
      prisma.task.findMany({ where: { userId, status: { not: 'done' } }, take: 10 }),
      prisma.email.findMany({ where: { id: { in: emailIds }, userId } }),
    ]);

    if (!emails.length) return NextResponse.json({ error: 'No emails found' }, { status: 404 });

    const northStar = profile?.northStar || 'Personal freedom and growth';
    const goalsList = goals.map((g: any) => `${g.title} (${g.pillar || 'general'})`).join(', ');
    const tasksList = tasks.map((t: any) => t.title).join(', ');

    // Fetch learning history
    const recentActions = await prisma.email.findMany({
      where: { userId, userAction: { not: null } },
      orderBy: { userActionAt: 'desc' },
      take: 30,
      select: { fromAddress: true, fromName: true, subject: true, aiAction: true, userAction: true },
    });
    const overrides = recentActions.filter(a => a.aiAction && a.userAction && a.aiAction !== a.userAction && !(a.aiAction === 'reply_needed' && a.userAction === 'reply') && !(a.aiAction === 'add_task' && a.userAction === 'task'));
    let learningContext = '';
    if (overrides.length > 0) {
      learningContext += `\n## LEARNING FROM USER BEHAVIOR (${overrides.length} corrections):\n`;
      for (const o of overrides.slice(0, 10)) {
        learningContext += `- "${o.subject?.substring(0, 50)}" from ${o.fromName || o.fromAddress}: AI said "${o.aiAction}" → User did "${o.userAction}"\n`;
      }
    }

    // Build prompt for AI
    const emailDescriptions = emails.map((e: any, i: number) =>
      `Email ${i + 1} [ID: ${e.id}]:\n  From: ${e.fromName || e.fromAddress}\n  Subject: ${e.subject}\n  Preview: ${(e.bodyText || '').substring(0, 300)}\n  Date: ${e.date}`
    ).join('\n\n');

    // Group selected emails by thread for smarter triage
    const threadMap = new Map<string, typeof emails>();
    for (const e of emails) {
      const tid = e.threadId || (e.subject || '').replace(/^(re|fwd|fw):\s*/gi, '').replace(/^(re|fwd|fw):\s*/gi, '').trim().toLowerCase();
      if (!threadMap.has(tid)) threadMap.set(tid, []);
      threadMap.get(tid)!.push(e);
    }

    const threadDescriptions = Array.from(threadMap.entries()).map(([tid, threadEmails]) => {
      const sorted = [...threadEmails].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const latest = sorted[sorted.length - 1];
      const ids = sorted.map((e: any) => e.id);
      const participants = [...new Set(sorted.map((e: any) => e.fromName || e.fromAddress))];
      let desc = `Thread [IDs: ${ids.join(',')}] (${sorted.length} messages):\n`;
      desc += `  Subject: ${latest.subject}\n  Participants: ${participants.join(', ')}\n`;
      desc += `  Latest from: ${latest.fromName || latest.fromAddress} (${latest.date})\n`;
      if (latest.bodyText) desc += `  Latest preview: ${(latest.bodyText || '').substring(0, 400)}\n`;
      return desc;
    }).join('\n---\n');

    const prompt = `You are a RUTHLESS AI executive assistant managing email threads for **Teo Xuan Hao** (also goes by "Xuan Hao" or "XH"). He has ADHD and needs inbox zero.

CONTEXT: Email accounts: teoxuanhao1@gmail.com, virallycoliving@gmail.com, Zoho mail. Work colleague: Joel Fu.
North Star: "${northStar}". Goals: ${goalsList || 'None'}. Tasks: ${tasksList || 'None'}.

Analyze EMAIL THREADS (conversations). Your decision applies to the ENTIRE thread.

## EMAIL ZEROING RULES:
1. **Spam / Promotional / Marketing / Mass notifications** → "delete"
2. **Actionable emails (easy)** → "add_task" — easiest first
3. **Actionable after future date** → "archive" (note date in actionDetail)
4. **CC'd / No action from Xuan Hao** → "archive" — might reference later
5. **No action, info needed <6mo** → "archive"
6. **No action, info needed >6mo** → "add_task" (save notes) then delete
7. **Travel/Events** → "add_task" (add to calendar) then archive
8. **Security alerts / account notifications / verifications** → "archive" — keep, no action
9. **Needs Xuan Hao's unique human judgment + aligned** → "reply_needed"
10. **Simple reply** → "auto_reply"
11. **Receipts / payment confirmations / refunds** → "archive" — financial records

CRITICAL: Only DELETE genuine spam/marketing. Security alerts, payment notices, service updates = ARCHIVE not delete.
${learningContext}
For EACH THREAD return (ONLY valid JSON array):
[{"ids": ["id1","id2"], "summary": "2-3 sentence summary: what is this about, current status, key context", "pendingDecisions": "What decisions/actions pending and by whom (names). null if none.", "urgency": "critical|high|medium|low", "category": "action-required|fyi|newsletter|personal|finance|promotional|travel", "action": "reply_needed|add_task|read_later|archive|delete|auto_reply", "actionDetail": "why this action + any notes, max 120 chars", "draftReply": "..."|null, "taskTitle": "..."|null, "northStarAlign": 1-10}]

${threadDescriptions}`;

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      console.error('[AI TRIAGE] API error:', await aiRes.text());
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let triageResults: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) triageResults = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[AI TRIAGE] Parse error:', parseErr, 'Content:', content.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    // Update emails with AI results (thread-based: r.ids is an array)
    const updates = [];
    const stats = { reply_needed: 0, add_task: 0, read_later: 0, archive: 0, delete: 0, auto_reply: 0 };

    for (const result of triageResults) {
      const action = result.action || 'archive';
      // Support both thread-based (ids array) and legacy (single id)
      const emailIds = result.ids || (result.id ? [result.id] : []);

      for (const eid of emailIds) {
        const email = emails.find((e: any) => e.id === eid);
        if (!email) continue;
        if (action in stats) stats[action as keyof typeof stats]++;
        const richSummary = [
          result.summary || '',
          result.pendingDecisions ? `⏳ Pending: ${result.pendingDecisions}` : '',
          result.actionDetail ? `💡 Recommendation: ${result.actionDetail}` : '',
        ].filter(Boolean).join('\n');

        updates.push(
          prisma.email.update({
            where: { id: email.id },
            data: {
              aiSummary: richSummary,
              aiUrgency: result.urgency,
              aiCategory: result.category,
              aiAction: action,
              aiActionDetail: result.actionDetail,
              aiDraftReply: result.draftReply || null,
              northStarAlign: result.northStarAlign,
            },
          })
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({
      triaged: triageResults.length,
      stats,
      results: triageResults,
    });
  } catch (e: any) {
    console.error('[AI TRIAGE ERROR]', e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: 'Triage failed' }, { status: 500 });
  }
}
