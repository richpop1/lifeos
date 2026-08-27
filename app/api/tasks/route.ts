export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

async function aiBreakdown(title: string, goalTitle?: string): Promise<{ title: string; done: boolean }[] | null> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return null;
  try {
    const goalCtx = goalTitle ? ` (part of goal: "${goalTitle}")` : '';
    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: `Break down this task into 3-5 concrete subtasks. Be specific and actionable. Task: "${title}"${goalCtx}\n\nReturn ONLY a JSON array: [{"title": "..."}]. No explanation.` }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const items = JSON.parse(match[0]);
      return items.map((i: any) => ({ title: i.title || i.name || String(i), done: false }));
    }
  } catch (e) { console.error('[AI BREAKDOWN]', e); }
  return null;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { goal: { select: { id: true, title: true, pillar: true, weight: true, isProject: true } } },
    });
    // Attach source email subject for tasks linked to emails
    const emailIds = tasks.filter(t => t.sourceEmailId).map(t => t.sourceEmailId as string);
    let emailMap: Record<string, { subject: string }> = {};
    if (emailIds.length > 0) {
      const emails = await prisma.email.findMany({ where: { id: { in: emailIds } }, select: { id: true, subject: true } });
      emailMap = Object.fromEntries(emails.map(e => [e.id, { subject: e.subject }]));
    }
    const enriched = tasks.map(t => ({ ...t, sourceEmail: t.sourceEmailId ? emailMap[t.sourceEmailId] || null : null }));
    return NextResponse.json(enriched);
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // If goalId provided, fetch goal title for AI context
    let goalTitle: string | undefined;
    if (body.goalId) {
      const goal = await prisma.goal.findFirst({ where: { id: body.goalId, userId }, select: { title: true, pillar: true } });
      goalTitle = goal?.title;
      // Auto-inherit pillar from goal if not set
      if (!body.pillar && goal?.pillar) body.pillar = goal.pillar;
    }

    // AI auto-breakdown (fire and forget if skipBreakdown not set)
    let subtasks = body.subtasks ?? null;
    if (!subtasks && body.title && body.autoBreakdown !== false) {
      subtasks = await aiBreakdown(body.title, goalTitle);
    }

    const task = await prisma.task.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        pillar: body.pillar ?? null,
        goalId: body.goalId ?? null,
        status: body.status ?? 'todo',
        priority: body.priority ?? 'medium',
        isNeedleMover: body.isNeedleMover ?? false,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        scheduledStartTime: body.scheduledStartTime ? new Date(body.scheduledStartTime) : null,
        scheduledEndTime: body.scheduledEndTime ? new Date(body.scheduledEndTime) : null,
        estimatedMins: body.estimatedMins ? parseInt(body.estimatedMins) : null,
        subtasks: subtasks as any,
        notes: body.notes ?? null,
        sourceEmailId: body.sourceEmailId ?? null,
      },
      include: { goal: { select: { id: true, title: true, pillar: true, weight: true, isProject: true } } },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}
