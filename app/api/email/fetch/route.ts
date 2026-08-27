export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';

function sanitizeForPostgres(str: string): string {
  // Remove null bytes that crash PostgreSQL
  return str.replace(/\x00/g, '').replace(/\0/g, '');
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .trim();
}

async function parseBodyFromSource(source: Buffer): Promise<{ text: string; html: string | null }> {
  try {
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(source);
    let text = parsed.text || '';
    const html = parsed.html || null;
    if (!text && html) {
      text = stripHtmlToText(html);
    }
    return { text: text.substring(0, 2000), html };
  } catch (err) {
    console.error('[EMAIL PARSE] mailparser failed:', err);
    const raw = source.toString('utf-8');
    const headerEnd = raw.indexOf('\n\n');
    if (headerEnd > 0) {
      let body = raw.substring(headerEnd + 2, headerEnd + 5000).trim();
      body = stripHtmlToText(body);
      return { text: body.substring(0, 2000), html: null };
    }
    return { text: '', html: null };
  }
}

// POST — sync emails from IMAP server into DB
// Pass fullSync: true to fetch ALL emails (envelope-only for speed)
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { accountId, limit = 30, fullSync = false } = body;

    if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

    const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    let password: string;
    try {
      password = decrypt(account.encryptedPassword);
    } catch (decErr: any) {
      console.error('[EMAIL FETCH] Decrypt failed:', decErr?.message);
      return NextResponse.json({ error: 'Failed to decrypt credentials. Try reconnecting.' }, { status: 500 });
    }

    let ImapFlow: any;
    try {
      const mod = await import('imapflow');
      ImapFlow = mod.ImapFlow;
    } catch (importErr: any) {
      console.error('[EMAIL FETCH] ImapFlow import failed:', importErr?.message);
      return NextResponse.json({ error: 'Email module not available' }, { status: 500 });
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
    });

    try {
      await client.connect();
    } catch (connErr: any) {
      console.error('[EMAIL FETCH] IMAP connect failed:', connErr?.message);
      return NextResponse.json({
        error: `Connection failed: ${connErr?.message?.includes('auth') ? 'Wrong password or App Password needed' : connErr?.message || 'Check settings'}`
      }, { status: 502 });
    }

    const rawEmails: any[] = [];

    // Discover folders
    const foldersToSync: string[] = ['INBOX'];
    try {
      const mailboxes = await client.list();
      for (const mb of mailboxes) {
        const path = mb.path;
        const skipPatterns = /trash|spam|junk|drafts?|sent|\[gmail\]\/(spam|trash|drafts|sent|starred|important|all mail)/i;
        if (skipPatterns.test(path)) continue;
        if (path === 'INBOX') continue;
        foldersToSync.push(path);
      }
    } catch { /* use INBOX only */ }

    for (const folder of foldersToSync) {
      let lock: any;
      try {
        lock = await client.getMailboxLock(folder);
        const mb = client.mailbox as any;
        const totalMessages = mb?.exists || 0;

        if (totalMessages > 0) {
          // fullSync: fetch ALL from seq 1, envelope-only (body fetched on-demand)
          // normal: fetch latest N with full source
          const effectiveLimit = fullSync ? totalMessages : Math.min(limit, totalMessages);
          const startSeq = fullSync ? 1 : Math.max(1, totalMessages - effectiveLimit + 1);

          const fetchOpts: any = { envelope: true, bodyStructure: true };
          if (!fullSync) fetchOpts.source = true; // only fetch body for non-full-sync

          // Also fetch flags to sync read/starred state from server
          fetchOpts.flags = true;

          for await (const message of client.fetch(`${startSeq}:*`, fetchOpts)) {
            const env = message.envelope;
            if (!env) continue;

            let bodyText = '';
            let bodyHtml: string | null = null;
            if (!fullSync && message.source) {
              const parsed = await parseBodyFromSource(message.source);
              bodyText = parsed.text;
              bodyHtml = parsed.html;
            }

            // Read flags from IMAP
            const flags = message.flags ? Array.from(message.flags) : [];
            const isRead = flags.includes('\\Seen');
            const isStarred = flags.includes('\\Flagged');

            rawEmails.push({
              messageId: env.messageId || `seq-${message.seq}-${account.id}`,
              from: env.from?.[0] || {},
              to: env.to?.[0] || {},
              subject: env.subject || '(no subject)',
              date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
              seq: message.seq,
              bodyText,
              bodyHtml,
              folder,
              isRead,
              isStarred,
            });
          }
        }

        lock.release();
      } catch (fetchErr: any) {
        console.error(`[EMAIL FETCH] Folder ${folder} failed:`, fetchErr?.message);
        if (lock) try { lock.release(); } catch {}
      }
    }

    try { await client.logout(); } catch {}

    // Upsert into DB
    let newCount = 0;
    for (const em of rawEmails) {
      const fromAddr = em.from?.address || 'unknown';
      const fromName = em.from?.name || '';
      const toAddr = em.to?.address || account.email;
      const msgId = em.messageId;

      const existing = await prisma.email.findFirst({
        where: { accountId: account.id, messageId: msgId },
      });

      if (!existing) {
        await prisma.email.create({
          data: {
            userId, accountId: account.id,
            messageId: msgId,
            fromAddress: fromAddr,
            fromName: sanitizeForPostgres(fromName),
            toAddress: toAddr,
            subject: sanitizeForPostgres(em.subject),
            bodyText: em.bodyText ? sanitizeForPostgres(em.bodyText) : null,
            bodyHtml: em.bodyHtml ? sanitizeForPostgres(em.bodyHtml) : null,
            folder: em.folder || 'INBOX',
            date: new Date(em.date),
            isRead: em.isRead || false,
            isStarred: em.isStarred || false,
          },
        });
        newCount++;
      } else {
        // If user already actioned this email, NEVER overwrite — user decisions are final
        if (existing.userAction) continue;

        // Update body if missing, and sync IMAP flags
        const updateData: any = {};
        if (!existing.bodyText && em.bodyText) updateData.bodyText = sanitizeForPostgres(em.bodyText);
        if (!existing.bodyHtml && em.bodyHtml) updateData.bodyHtml = sanitizeForPostgres(em.bodyHtml);
        // Sync read/starred state from IMAP (server is source of truth for initial sync)
        if (em.isRead !== undefined && em.isRead !== existing.isRead) updateData.isRead = em.isRead;
        if (em.isStarred !== undefined && em.isStarred !== existing.isStarred) updateData.isStarred = em.isStarred;
        if (Object.keys(updateData).length > 0) {
          await prisma.email.update({ where: { id: existing.id }, data: updateData });
        }
      }
    }

    return NextResponse.json({
      fetched: newCount,
      total: rawEmails.length,
      fullSync,
      message: newCount > 0 ? `${newCount} new emails synced` : 'Already up to date',
    });
  } catch (e: any) {
    console.error('[EMAIL FETCH ERROR]', e?.message || e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message || 'Failed to fetch emails' }, { status: 500 });
  }
}
