import { prisma } from '@/lib/prisma';
import { computeDedupHash, findDuplicates } from '@/lib/transaction-dedup';

const CATEGORIES = ['Food & Dining', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Education', 'Groceries', 'Subscriptions', 'Income - Salary', 'Income - Business', 'Income - Freelance', 'Income - Other', 'Savings', 'Investment', 'Transfer', 'Refund', 'IOU', 'Other'];

// Sender-to-account matching rules (case-insensitive substring match on fromAddress)
const SENDER_ACCOUNT_MAP: { pattern: RegExp; accountName: string; confidence: number }[] = [
  { pattern: /dbs\.com/i, accountName: 'DBS Bank', confidence: 0.95 },
  { pattern: /dbs/i, accountName: 'DBS Bank', confidence: 0.8 },
  { pattern: /citibank|citi\.com/i, accountName: 'Citibank', confidence: 0.95 },
  { pattern: /crypto\.com/i, accountName: 'Crypto.com', confidence: 0.9 },
  { pattern: /tiger.*broker/i, accountName: 'Tiger Brokers', confidence: 0.9 },
  { pattern: /syfe/i, accountName: 'Syfe', confidence: 0.9 },
  { pattern: /coinhako/i, accountName: 'Coinhako', confidence: 0.9 },
  { pattern: /grab/i, accountName: 'DBS Bank', confidence: 0.5 }, // Common SG payment
  { pattern: /paypal/i, accountName: 'DBS Bank', confidence: 0.4 },
];

interface IngestResult {
  created: number;
  pending: number;
  confirmed: number;
  skippedDupes: number;
  skippedNoTxns: number;
  errors: string[];
  processedEmailIds: string[];
}

/**
 * Auto-match an email sender to a FinanceAccount.
 * Returns { accountId, confidence } or { accountId: null, confidence: 0 } if no match.
 */
async function matchAccount(
  userId: string,
  fromAddress: string,
  accounts: { id: string; name: string; type: string }[]
): Promise<{ accountId: string | null; confidence: number }> {
  for (const rule of SENDER_ACCOUNT_MAP) {
    if (rule.pattern.test(fromAddress)) {
      const acct = accounts.find(
        a => a.name.toLowerCase() === rule.accountName.toLowerCase()
      );
      if (acct) return { accountId: acct.id, confidence: rule.confidence };
    }
  }
  return { accountId: null, confidence: 0 };
}

/**
 * Use LLM to extract transactions from an email body.
 */
async function extractTransactionsFromEmail(
  bodyText: string,
  fromAddress: string,
  subject: string
): Promise<{ date: string; amount: number; type: string; description: string; category: string }[]> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return [];

  const bank = fromAddress.toLowerCase().includes('dbs') ? 'DBS'
    : fromAddress.toLowerCase().includes('citi') ? 'Citibank'
    : fromAddress.toLowerCase().includes('crypto.com') ? 'Crypto.com'
    : 'Unknown';

  const prompt = `Extract ALL financial transactions from this ${bank} bank/finance email.

Subject: ${subject}

For each transaction provide:
- date (YYYY-MM-DD format, infer from email context if not explicit)
- amount (positive number, no currency symbol)
- type ("expense" or "income")
- description (merchant/payee name, cleaned up, max 100 chars)
- category (one of: ${CATEGORIES.join(', ')})

Email content:
---
${bodyText.substring(0, 6000)}
---

Rules:
- Extract individual transactions, NOT summary totals or balance info
- If this is a notification about a single transaction, extract that one transaction
- If this is a statement with multiple transactions, extract each one
- If no clear transaction data exists (e.g. just marketing, account alerts with no amounts), return []
- For credit card payments/bills, type is "expense"
- For salary/transfers in, type is "income"

Respond with ONLY a JSON array like:
[{"date": "2025-01-15", "amount": 45.50, "type": "expense", "description": "Grab ride", "category": "Transport"}]

If no transactions found, return []. No explanation.`;

  try {
    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.error('[FINANCE INGEST] LLM error:', res.status);
      return [];
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let txns: any[] = [];
    try { txns = JSON.parse(jsonMatch?.[0] || '[]'); } catch { return []; }

    return txns
      .filter((t: any) => t && t.amount > 0 && t.description)
      .map((t: any) => ({
        date: t.date || new Date().toISOString().split('T')[0],
        amount: Math.abs(parseFloat(t.amount) || 0),
        type: t.type === 'income' ? 'income' : 'expense',
        description: String(t.description).substring(0, 200),
        category: CATEGORIES.includes(t.category) ? t.category : 'Other',
      }));
  } catch (e) {
    console.error('[FINANCE INGEST] Extract error:', e);
    return [];
  }
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

/**
 * Main ingest pipeline: scan finance emails → extract → match → dedup → persist.
 * Idempotent: tracks sourceEmailId to avoid re-processing.
 */
export async function ingestFinanceEmails(userId: string): Promise<IngestResult> {
  const result: IngestResult = {
    created: 0, pending: 0, confirmed: 0,
    skippedDupes: 0, skippedNoTxns: 0,
    errors: [], processedEmailIds: [],
  };

  // 1. Get user's finance accounts for matching
  const accounts = await prisma.financeAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, type: true },
  });

  // 2. Find finance-tagged emails not yet ingested
  //    Already-ingested emails have a Transaction with their sourceEmailId
  const alreadyIngested = await prisma.transaction.findMany({
    where: { userId, sourceEmailId: { not: null } },
    select: { sourceEmailId: true },
    distinct: ['sourceEmailId'],
  });
  const ingestedSet = new Set(alreadyIngested.map(t => t.sourceEmailId!));

  const financeEmails = await prisma.email.findMany({
    where: {
      userId,
      aiCategory: 'finance',
      bodyText: { not: null },
    },
    orderBy: { date: 'desc' },
    take: 50,
    select: {
      id: true, fromAddress: true, fromName: true,
      subject: true, date: true, bodyText: true, bodyHtml: true,
    },
  });

  // Also scan emails matching common bank sender patterns (may not be tagged finance yet)
  const bankEmails = await prisma.email.findMany({
    where: {
      userId,
      bodyText: { not: null },
      OR: [
        { fromAddress: { contains: 'dbs', mode: 'insensitive' } },
        { fromAddress: { contains: 'citibank', mode: 'insensitive' } },
        { fromAddress: { contains: 'citi.com', mode: 'insensitive' } },
        { fromAddress: { contains: 'crypto.com', mode: 'insensitive' } },
        { subject: { contains: 'transaction alert', mode: 'insensitive' } },
        { subject: { contains: 'payment received', mode: 'insensitive' } },
        { subject: { contains: 'card transaction', mode: 'insensitive' } },
      ],
    },
    orderBy: { date: 'desc' },
    take: 30,
    select: {
      id: true, fromAddress: true, fromName: true,
      subject: true, date: true, bodyText: true, bodyHtml: true,
    },
  });

  // Merge and deduplicate email list
  const emailMap = new Map<string, typeof financeEmails[0]>();
  for (const e of [...financeEmails, ...bankEmails]) {
    if (!emailMap.has(e.id)) emailMap.set(e.id, e);
  }

  // Filter out already-ingested
  const toProcess = Array.from(emailMap.values()).filter(e => !ingestedSet.has(e.id));

  if (toProcess.length === 0) {
    return result;
  }

  // 3. Fetch transaction rules for categorization
  const rules = await prisma.transactionRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'desc' },
  });

  // 4. Process each email
  for (const email of toProcess.slice(0, 30)) { // Cap at 30 per run
    try {
      const body = email.bodyText || (email.bodyHtml ? stripHtml(email.bodyHtml) : '');
      if (!body || body.length < 30) {
        result.skippedNoTxns++;
        continue;
      }

      // Extract transactions via LLM
      const extracted = await extractTransactionsFromEmail(
        body, email.fromAddress, email.subject
      );

      if (extracted.length === 0) {
        result.skippedNoTxns++;
        // Mark as processed even if no txns found (avoid re-processing)
        result.processedEmailIds.push(email.id);
        // Create a marker transaction that won't show in UI
        await prisma.transaction.create({
          data: {
            userId,
            amount: 0,
            type: 'expense',
            category: '_email_processed',
            note: `No transactions found in: ${email.subject}`,
            sourceEmailId: email.id,
            source: 'email_ingest',
            status: 'confirmed',
            date: email.date || new Date(),
            dedupHash: `noop_${email.id}`,
          },
        });
        continue;
      }

      // Match account
      const { accountId, confidence } = await matchAccount(userId, email.fromAddress, accounts);
      const isPending = !accountId || confidence < 0.6;

      // Compute dedup hashes
      const txnData = extracted.map(t => {
        const parsedDate = new Date(t.date);
        const date = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const hash = computeDedupHash(t.amount, date, t.description);
        return { ...t, parsedDate: date, hash };
      });

      // Batch dedup check
      const existingHashes = await findDuplicates(userId, txnData.map(t => t.hash));

      // Apply rules and persist
      for (const txn of txnData) {
        if (existingHashes.has(txn.hash)) {
          result.skippedDupes++;
          continue;
        }

        let category = txn.category;
        let tags: string[] = [];
        let note = txn.description;

        // Apply user rules (rules override AI)
        for (const rule of rules) {
          const conditions = rule.conditions as any[];
          const actions = rule.actions as any[];
          let match = conditions.length > 0;
          for (const cond of conditions) {
            const fieldVal = (cond.field === 'note' ? note : cond.field === 'amount' ? String(txn.amount) : cond.field === 'type' ? txn.type : '').toLowerCase();
            const condVal = (cond.value || '').toLowerCase();
            switch (cond.op) {
              case 'contains': if (!fieldVal.includes(condVal)) match = false; break;
              case 'equals': if (fieldVal !== condVal) match = false; break;
              case 'starts_with': if (!fieldVal.startsWith(condVal)) match = false; break;
              default: break;
            }
          }
          if (match) {
            for (const act of actions) {
              if (act.type === 'category') category = act.value;
              if (act.type === 'tag') tags.push(act.value);
            }
          }
        }

        await prisma.transaction.create({
          data: {
            userId,
            amount: txn.amount,
            type: txn.type,
            category,
            note,
            tags: tags.length > 0 ? tags : undefined,
            accountId: accountId || null,
            date: txn.parsedDate,
            dedupHash: txn.hash,
            status: isPending ? 'pending' : 'confirmed',
            source: 'email_ingest',
            sourceEmailId: email.id,
            matchConfidence: confidence,
          },
        });

        result.created++;
        if (isPending) result.pending++;
        else result.confirmed++;
      }

      result.processedEmailIds.push(email.id);
    } catch (err: any) {
      console.error(`[FINANCE INGEST] Error processing email ${email.id}:`, err?.message);
      result.errors.push(`${email.subject}: ${err?.message}`);
    }
  }

  return result;
}
