export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET emails from DB (no IMAP) — supports threaded view
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder') || 'INBOX';
    const limit = parseInt(searchParams.get('limit') || '50');
    const unreadOnly = searchParams.get('unread') === 'true';
    const threaded = searchParams.get('threaded') !== 'false'; // default: threaded

    const accountId = searchParams.get('accountId');
    const includeActioned = searchParams.get('includeActioned') === 'true';
    const where: any = { userId };
    if (folder !== 'ALL') where.folder = folder;
    if (unreadOnly) where.isRead = false;
    if (accountId) where.accountId = accountId;
    // Server-side: exclude soft-deleted/spam emails unless explicitly requested
    // userAction can be null (most emails), so we need OR logic
    if (!includeActioned) {
      where.OR = [
        { userAction: null },
        { userAction: { notIn: ['delete', 'spam'] } },
      ];
    }

    const allEmails = await prisma.email.findMany({
      where,
      orderBy: { date: 'desc' },
      take: Math.min(limit, 1000),
      include: {
        account: { select: { label: true, email: true } },
      },
    });

    let emails = allEmails;
    let threads: any[] = [];

    if (threaded) {
      // Group by threadId, return the latest email per thread + thread metadata
      const threadMap = new Map<string, typeof allEmails>();
      for (const e of allEmails) {
        const tid = e.threadId || e.id; // fallback to individual email
        if (!threadMap.has(tid)) threadMap.set(tid, []);
        threadMap.get(tid)!.push(e);
      }

      threads = Array.from(threadMap.entries()).map(([tid, threadEmails]) => {
        const sorted = threadEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0];
        const participants = [...new Set(sorted.map(e => e.fromName || e.fromAddress))];
        const hasUnread = sorted.some(e => !e.isRead);
        return {
          ...latest,
          threadId: tid,
          threadCount: sorted.length,
          threadParticipants: participants,
          threadHasUnread: hasUnread,
          threadEmails: sorted.length > 1 ? sorted.slice(1).map(e => ({
            id: e.id, fromName: e.fromName, fromAddress: e.fromAddress,
            subject: e.subject, date: e.date, isRead: e.isRead,
            aiSummary: e.aiSummary, aiAction: e.aiAction,
          })) : [],
        };
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      emails = threads as any;
    }

    const unreadCount = await prisma.email.count({
      where: { userId, isRead: false },
    });

    return NextResponse.json({ emails, unreadCount, threaded });
  } catch (e: any) { return handleApiError(e); }
}
