/**
 * Auto-detect — Scans live data for unresolved threads that should become open loops.
 *
 * Sources (Sprint 1):
 * 1. Emails: aiCategory='action-required' or aiUrgency='critical'|'high' that haven't been actioned
 * 2. Tasks: overdue or due today/tomorrow
 * 3. Contacts: catchUpFrequency exceeded
 *
 * Called by the nightly ritual daemon and the /api/butler/chat endpoint (auto-detect trigger).
 * Each detected item is fed to dedupAndCreateLoop — if it already exists, mention count increments.
 */
import { prisma } from '@/lib/prisma';
import { dedupAndCreateLoop } from './dedup';
import type { OpenLoop } from '@prisma/client';

export interface AutoDetectResult {
  created: OpenLoop[];
  bumped: OpenLoop[];
  skipped: number;
}

export async function runAutoDetect(userId: string): Promise<AutoDetectResult> {
  const result: AutoDetectResult = { created: [], bumped: [], skipped: 0 };

  await Promise.all([
    detectEmailLoops(userId, result),
    detectTaskLoops(userId, result),
    detectContactLoops(userId, result),
  ]);

  return result;
}

// ═══ EMAIL LOOPS ═══
async function detectEmailLoops(userId: string, out: AutoDetectResult): Promise<void> {
  // Emails that need action but haven't been actioned (last 7 days)
  const cutoff = new Date(Date.now() - 7 * 86400000);
  const emails = await prisma.email.findMany({
    where: {
      userId,
      userAction: null,
      date: { gte: cutoff },
      OR: [
        { aiCategory: 'action-required' },
        { aiUrgency: { in: ['critical', 'high'] } },
      ],
    },
    orderBy: { date: 'desc' },
    take: 20,
    select: { id: true, subject: true, fromName: true, fromAddress: true, aiUrgency: true, aiCategory: true, aiAction: true, date: true },
  });

  for (const email of emails) {
    const content = `Email needs action: "${email.subject}" from ${email.fromName || email.fromAddress}`;
    const urgency = email.aiUrgency === 'critical' ? 'critical' : email.aiUrgency === 'high' ? 'high' : 'medium';
    try {
      const { loop, action } = await dedupAndCreateLoop(userId, {
        content,
        source: 'email',
        sourceId: email.id,
        type: 'followup',
        urgency,
        aiConfidence: 0.7,
      });
      if (action === 'created') out.created.push(loop);
      else if (action === 'bumped') out.bumped.push(loop);
      else out.skipped++;
    } catch { out.skipped++; }
  }
}

// ═══ TASK LOOPS ═══
async function detectTaskLoops(userId: string, out: AutoDetectResult): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  tomorrow.setHours(23, 59, 59, 999);

  // Overdue or due today/tomorrow, not done
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: { not: 'done' },
      dueDate: { lte: tomorrow },
    },
    orderBy: { dueDate: 'asc' },
    take: 20,
    select: { id: true, title: true, priority: true, dueDate: true, status: true },
  });

  for (const task of tasks) {
    const isOverdue = task.dueDate && task.dueDate < now;
    const label = isOverdue ? 'Overdue task' : 'Task due soon';
    const urgency = isOverdue ? 'high' : task.priority === 'high' ? 'high' : 'medium';
    const content = `${label}: "${task.title}"${task.dueDate ? ` (due ${task.dueDate.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })})` : ''}`;
    try {
      const { loop, action } = await dedupAndCreateLoop(userId, {
        content,
        source: 'task',
        sourceId: task.id,
        type: 'task',
        urgency,
        aiConfidence: 0.9,
      });
      if (action === 'created') out.created.push(loop);
      else if (action === 'bumped') out.bumped.push(loop);
      else out.skipped++;
    } catch { out.skipped++; }
  }
}

// ═══ CONTACT LOOPS ═══
async function detectContactLoops(userId: string, out: AutoDetectResult): Promise<void> {
  // Contacts with catchUpFrequency where lastContactedAt is overdue
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      isArchived: false,
      catchUpFrequency: { not: null },
    },
    select: { id: true, name: true, nickname: true, catchUpFrequency: true, lastContactedAt: true, relationship: true },
  });

  const now = Date.now();
  for (const contact of contacts) {
    if (!contact.catchUpFrequency) continue;
    const lastContact = contact.lastContactedAt?.getTime() || 0;
    const daysSince = Math.floor((now - lastContact) / 86400000);
    if (daysSince < contact.catchUpFrequency) continue;

    const displayName = contact.nickname || contact.name;
    const content = `Haven't caught up with ${displayName} in ${daysSince} days (goal: every ${contact.catchUpFrequency} days)`;
    const urgency = daysSince > contact.catchUpFrequency * 2 ? 'high' : 'medium';
    try {
      const { loop, action } = await dedupAndCreateLoop(userId, {
        content,
        source: 'contact',
        sourceId: contact.id,
        type: 'followup',
        pillar: 'relationship',
        urgency,
        aiConfidence: 0.8,
      });
      if (action === 'created') out.created.push(loop);
      else if (action === 'bumped') out.bumped.push(loop);
      else out.skipped++;
    } catch { out.skipped++; }
  }
}
