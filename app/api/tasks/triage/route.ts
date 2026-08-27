export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — bulk triage: accept, dismiss, or edit AI-created tasks
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { actions } = await req.json();
    // actions: [{id, action: 'accept'|'dismiss'|'edit', edits?: {title?, priority?, goalId?}}]

    if (!Array.isArray(actions)) return NextResponse.json({ error: 'actions must be an array' }, { status: 400 });

    let accepted = 0, dismissed = 0, edited = 0;

    for (const a of actions) {
      const task = await prisma.task.findFirst({ where: { id: a.id, userId } });
      if (!task) continue;

      switch (a.action) {
        case 'accept':
          await prisma.task.update({ where: { id: a.id }, data: { triageStatus: 'accepted' } });
          accepted++;
          break;
        case 'dismiss':
          await prisma.task.update({ where: { id: a.id }, data: {
            triageStatus: 'dismissed',
            status: 'done',
            resolution: 'irrelevant',
            resolvedAt: new Date(),
            resolvedReason: a.reason || 'Dismissed during triage',
          }});
          dismissed++;
          break;
        case 'edit':
          const edits: any = { triageStatus: 'accepted' };
          if (a.edits?.title) edits.title = a.edits.title;
          if (a.edits?.priority) edits.priority = a.edits.priority;
          if (a.edits?.goalId !== undefined) edits.goalId = a.edits.goalId || null;
          if (a.edits?.pillar) edits.pillar = a.edits.pillar;
          if (a.edits?.dueDate) edits.dueDate = new Date(a.edits.dueDate);
          await prisma.task.update({ where: { id: a.id }, data: edits });
          edited++;
          break;
      }
    }

    // Auto-trigger learning after every 5+ triage actions
    const recentTriageCount = await prisma.task.count({
      where: { userId, triageStatus: { in: ['accepted', 'dismissed'] }, updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recentTriageCount > 0 && recentTriageCount % 5 === 0) {
      // Fire-and-forget learning trigger
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      fetch(`${baseUrl}/api/ai/learn`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' }, body: JSON.stringify({}) }).catch(() => {});
    }

    return NextResponse.json({ accepted, dismissed, edited });
  } catch (e: any) { return handleApiError(e); }
}

// GET — fetch pending triage tasks
export async function GET() {
  try {
    const userId = await requireUserId();
    const tasks = await prisma.task.findMany({
      where: { userId, triageStatus: 'pending' },
      orderBy: [{ createdAt: 'desc' }],
      include: { goal: { select: { id: true, title: true } } },
    });
    // Attach source email subject for context
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
