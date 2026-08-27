export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';

const CATEGORIES = ['Food & Dining', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Education', 'Groceries', 'Subscriptions', 'Income - Salary', 'Income - Business', 'Income - Freelance', 'Income - Other', 'Savings', 'Investment', 'Transfer', 'Other'];

// Search user's email for bank statement emails, then parse them with LLM
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { action, emailId } = await req.json();

    // Step 1: Scan emails for bank statements
    if (action === 'scan') {
      const statementEmails = await prisma.email.findMany({
        where: {
          userId,
          OR: [
            { fromAddress: { contains: 'dbs', mode: 'insensitive' } },
            { fromAddress: { contains: 'citibank', mode: 'insensitive' } },
            { fromAddress: { contains: 'citi', mode: 'insensitive' } },
            { subject: { contains: 'statement', mode: 'insensitive' } },
            { subject: { contains: 'e-statement', mode: 'insensitive' } },
            { subject: { contains: 'credit card', mode: 'insensitive' } },
            { subject: { contains: 'transaction', mode: 'insensitive' } },
            { subject: { contains: 'account summary', mode: 'insensitive' } },
          ],
        },
        orderBy: { date: 'desc' },
        take: 20,
        select: { id: true, fromAddress: true, fromName: true, subject: true, date: true, bodyText: true, bodyHtml: true },
      });

      const results = statementEmails.map(e => ({
        id: e.id,
        from: e.fromName || e.fromAddress,
        subject: e.subject,
        date: e.date,
        hasBody: !!(e.bodyText || e.bodyHtml),
        bank: (e.fromAddress || '').toLowerCase().includes('dbs') ? 'DBS'
            : (e.fromAddress || '').toLowerCase().includes('citi') ? 'Citibank'
            : 'Other',
      }));

      return NextResponse.json({ emails: results });
    }

    // Step 2: Parse a specific email's body for transactions
    if (action === 'parse' && emailId) {
      let email = await prisma.email.findFirst({
        where: { id: emailId, userId },
        include: { account: true },
      });
      if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

      // Fetch body from IMAP if not cached
      if (!email.bodyText && !email.bodyHtml && email.messageId && email.account) {
        try {
          const account = email.account;
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
            if (uids?.length > 0) {
              const downloaded = await client.download(String(uids[0]), undefined, { uid: true });
              if (downloaded?.content) {
                const chunks: Buffer[] = [];
                for await (const chunk of downloaded.content) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
                const rawSource = Buffer.concat(chunks);
                const { simpleParser } = await import('mailparser');
                const parsed = await simpleParser(rawSource);
                const bodyText = parsed.text || '';
                const bodyHtml = parsed.html || null;
                await prisma.email.update({ where: { id: emailId }, data: { bodyText, bodyHtml } });
                email = { ...email, bodyText, bodyHtml } as any;
              }
            }
          } finally { lock.release(); }
          await client.logout();
        } catch (e) { console.error('[PARSE STATEMENT] IMAP fetch error:', e); }
      }

      const body = email!.bodyText || (email!.bodyHtml ? stripHtml(email!.bodyHtml) : '');
      if (!body || body.length < 50) {
        return NextResponse.json({ error: 'Could not retrieve email body. Try fetching the email first.' }, { status: 400 });
      }

      // Use LLM to extract transactions from the email body
      const apiKey = process.env.ABACUSAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

      const bank = (email!.fromAddress || '').toLowerCase().includes('dbs') ? 'DBS'
                 : (email!.fromAddress || '').toLowerCase().includes('citi') ? 'Citibank' : 'Unknown';

      const prompt = `Extract ALL transactions from this ${bank} bank email/statement.\n\nFor each transaction, provide:\n- date (YYYY-MM-DD format)\n- amount (positive number, no currency symbol)\n- type ("expense" or "income")\n- description (merchant/payee name, cleaned up)\n- category (one of: ${CATEGORIES.join(', ')})\n\nEmail content:\n---\n${body.substring(0, 8000)}\n---\n\nRespond with ONLY a JSON array like:\n[{"date": "2025-01-15", "amount": 45.50, "type": "expense", "description": "Grab ride", "category": "Transport"}]\n\nIf no transactions found, return []. No explanation.`;

      const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: prompt }], max_tokens: 4000 }),
      });

      if (!aiRes.ok) return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });

      const aiData = await aiRes.json();
      const aiText = aiData?.choices?.[0]?.message?.content || '[]';
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      let transactions: any[] = [];
      try { transactions = JSON.parse(jsonMatch?.[0] || '[]'); } catch { transactions = []; }

      // Validate and clean
      transactions = transactions.filter(t => t && t.amount > 0 && t.description).map(t => ({
        date: t.date || new Date().toISOString().split('T')[0],
        amount: parseFloat(t.amount) || 0,
        type: t.type === 'income' ? 'income' : 'expense',
        description: String(t.description).substring(0, 200),
        category: CATEGORIES.includes(t.category) ? t.category : 'Other',
      }));

      return NextResponse.json({
        transactions,
        bank,
        emailSubject: email!.subject,
        emailDate: email!.date,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) { return handleApiError(e); }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .trim();
}
