export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';

// GET single email with body
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const email = await prisma.email.findFirst({ where: { id: params.id, userId } });
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If no body fetched yet, try to fetch it via IMAP
    if (!email.bodyText && !email.bodyHtml && email.messageId) {
      try {
        const account = await prisma.emailAccount.findFirst({ where: { id: email.accountId, userId } });
        if (account) {
          const password = decrypt(account.encryptedPassword);
          const { ImapFlow } = await import('imapflow');
          const client = new ImapFlow({
            host: account.imapHost, port: account.imapPort, secure: true,
            auth: { user: account.email, pass: password }, logger: false,
          });
          await client.connect();
          const lock = await client.getMailboxLock('INBOX');
          try {
            const uids: any = await client.search({ header: { 'message-id': email.messageId } });
            if (uids && uids.length > 0) {
              const downloaded = await client.download(String(uids[0]), undefined, { uid: true });
              if (downloaded?.content) {
                const chunks: Buffer[] = [];
                for await (const chunk of downloaded.content) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
                const rawSource = Buffer.concat(chunks);

                // Use mailparser for proper MIME parsing
                let bodyText = '';
                let bodyHtml: string | null = null;
                try {
                  const { simpleParser } = await import('mailparser');
                  const parsed = await simpleParser(rawSource);
                  bodyText = parsed.text || '';
                  bodyHtml = parsed.html || null;
                  if (!bodyText && bodyHtml) {
                    bodyText = bodyHtml
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/[ \t]+/g, ' ')
                    .split('\n').map((l: string) => l.trim()).filter(Boolean).join('\n')
                    .trim();
                  }
                } catch {
                  // Fallback
                  const raw = rawSource.toString('utf-8');
                  const headerEnd = raw.indexOf('\n\n');
                  bodyText = headerEnd > 0 ? raw.substring(headerEnd + 2, headerEnd + 5000).trim() : '';
                }

                await prisma.email.update({
                  where: { id: email.id },
                  data: { bodyText, bodyHtml, isRead: true },
                });
                email.bodyText = bodyText;
                email.bodyHtml = bodyHtml;
              }
            }
          } finally { lock.release(); }
          await client.logout();
        }
      } catch (fetchErr: any) {
        console.error('[EMAIL BODY FETCH]', fetchErr?.message);
      }
    }

    // Mark as read
    if (!email.isRead) {
      await prisma.email.update({ where: { id: email.id }, data: { isRead: true } });
    }

    return NextResponse.json(email);
  } catch (e: any) { return handleApiError(e); }
}

// PATCH update email — syncs read/star/archive to IMAP
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { isRead, isStarred, labels, aiSummary, aiUrgency, aiCategory, aiAction, aiActionDetail, aiDraftReply, northStarAlign, userAction } = body;

    const data: any = {};
    if (isRead !== undefined) data.isRead = isRead;
    if (isStarred !== undefined) data.isStarred = isStarred;
    if (labels !== undefined) data.labels = labels;
    if (aiSummary !== undefined) data.aiSummary = aiSummary;
    if (aiUrgency !== undefined) data.aiUrgency = aiUrgency;
    if (aiCategory !== undefined) data.aiCategory = aiCategory;
    if (aiAction !== undefined) data.aiAction = aiAction;
    if (aiActionDetail !== undefined) data.aiActionDetail = aiActionDetail;
    if (aiDraftReply !== undefined) data.aiDraftReply = aiDraftReply;
    if (northStarAlign !== undefined) data.northStarAlign = northStarAlign;
    if (userAction !== undefined) {
      data.userAction = userAction;
      data.userActionAt = new Date();
    }

    await prisma.email.updateMany({
      where: { id: params.id, userId },
      data,
    });

    // Sync to IMAP — awaited so we know if it succeeded
    // task/reply = archive on mail server (email handled, remove from inbox)
    // spam = move to spam/junk folder
    // delete = move to trash
    // archive = move to archive
    // reclassified = no IMAP action (just re-labeling in Life OS)
    const imapActions = ['archive', 'delete', 'task', 'reply', 'spam'];
    const needsImapSync = isRead !== undefined || isStarred !== undefined || (userAction && imapActions.includes(userAction));
    let imapSynced = false;
    if (needsImapSync) {
      try {
        const email = await prisma.email.findFirst({
          where: { id: params.id, userId },
          include: { account: true },
        });
        if (email?.account && email.messageId) {
          const { imapSetRead, imapSetStar, imapArchive, imapMoveToTrash, imapMoveToSpam } = await import('@/lib/imap-helpers');
          const account = email.account;
          const folder = email.folder || 'INBOX';

          if (isRead !== undefined) {
            await imapSetRead(account, email.messageId, isRead, folder);
          }
          if (isStarred !== undefined) {
            await imapSetStar(account, email.messageId, isStarred, folder);
          }
          if (userAction === 'archive' || userAction === 'task' || userAction === 'reply') {
            // task/reply = email has been handled, archive it on the mail server
            const ok = await imapArchive(account, email.messageId, folder);
            console.log(`[IMAP SYNC] ${userAction} → archive: ${ok ? 'success' : 'failed'} for ${email.messageId}`);
          }
          if (userAction === 'delete') {
            const ok = await imapMoveToTrash(account, email.messageId, folder);
            console.log(`[IMAP SYNC] delete → trash: ${ok ? 'success' : 'failed'} for ${email.messageId}`);
          }
          if (userAction === 'spam') {
            const ok = await imapMoveToSpam(account, email.messageId, folder);
            console.log(`[IMAP SYNC] spam → junk: ${ok ? 'success' : 'failed'} for ${email.messageId}`);
          }
          imapSynced = true;
        }
      } catch (err: any) {
        console.error('[PATCH IMAP SYNC]', err?.message);
      }
    }

    return NextResponse.json({ ok: true, imapSynced });
  } catch (e: any) { return handleApiError(e); }
}

// DELETE — soft-deletes from DB (marks userAction='delete') and moves to Trash on mail server
// Soft-delete prevents zombie re-imports on next sync
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    const email = await prisma.email.findFirst({
      where: { id: params.id, userId },
      include: { account: true },
    });
    if (!email) return NextResponse.json({ ok: true });

    // Move to trash on IMAP
    let imapSynced = false;
    if (email.account && email.messageId) {
      try {
        const { imapMoveToTrash: imapTrash } = await import('@/lib/imap-helpers');
        imapSynced = await imapTrash(email.account, email.messageId, email.folder || 'INBOX');
      } catch (err: any) {
        console.error('[EMAIL DELETE] IMAP trash failed:', err?.message);
      }
    }

    // Soft-delete: mark as deleted in DB instead of removing the record
    await prisma.email.updateMany({
      where: { id: params.id, userId },
      data: { userAction: 'delete', userActionAt: new Date(), aiAction: 'delete', isRead: true },
    });

    return NextResponse.json({ ok: true, imapSynced });
  } catch (e: any) { return handleApiError(e); }
}
