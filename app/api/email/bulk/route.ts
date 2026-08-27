export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { imapBatchOperation } from '@/lib/imap-helpers';

// POST /api/email/bulk — batch delete or archive emails (syncs to IMAP)
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { action, ids } = await req.json();
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'action and ids required' }, { status: 400 });
    }

    // Fetch emails with account info for IMAP sync
    const emails = await prisma.email.findMany({
      where: { id: { in: ids }, userId },
      include: { account: true },
    });
    const validIds = emails.map(e => e.id);

    if (validIds.length === 0) {
      return NextResponse.json({ error: 'No valid emails found' }, { status: 404 });
    }

    // Sync to IMAP first, then update DB
    const imapOperation = action === 'delete' ? 'delete' : action === 'archive' ? 'archive' : null;
    let imapResult = { success: 0, failed: 0 };

    if (imapOperation) {
      const emailsForImap = emails
        .filter((e: any) => e.messageId && e.account)
        .map((e: any) => ({
          messageId: e.messageId,
          folder: e.folder || 'INBOX',
          account: e.account,
        }));

      if (emailsForImap.length > 0) {
        try {
          imapResult = await imapBatchOperation(emailsForImap, imapOperation);
          console.log(`[BULK ${action.toUpperCase()}] IMAP: ${imapResult.success} ok, ${imapResult.failed} failed`);
        } catch (err: any) {
          console.error(`[BULK ${action.toUpperCase()}] IMAP batch failed:`, err?.message);
        }
      }
    }

    // DB operations — soft-delete to prevent zombie re-imports
    if (action === 'delete') {
      await prisma.email.updateMany({
        where: { id: { in: validIds }, userId },
        data: { userAction: 'delete', userActionAt: new Date(), aiAction: 'delete', isRead: true },
      });
    } else if (action === 'archive') {
      await prisma.email.updateMany({
        where: { id: { in: validIds }, userId },
        data: { isRead: true, aiAction: 'archive', userAction: 'archive', userActionAt: new Date() },
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      count: validIds.length,
      imapSynced: imapResult.success,
      imapFailed: imapResult.failed,
    });
  } catch (e: any) { return handleApiError(e); }
}
