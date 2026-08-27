export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { computeDedupHash, findDuplicates } from '@/lib/transaction-dedup';

const CATEGORIES = ['Food & Dining', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Education', 'Groceries', 'Subscriptions', 'Income - Salary', 'Income - Business', 'Income - Freelance', 'Income - Other', 'Savings', 'Investment', 'Transfer', 'Other'];

// DBS CSV columns: "Transaction Date","Reference","Debit Amount","Credit Amount","Transaction Ref1","Transaction Ref2","Transaction Ref3"
// Citibank CSV columns: "Date","Transaction Description","Debit","Credit" or "Date","Description","Amount"
function detectBankFormat(header: string[]): 'dbs' | 'citibank' | 'generic' {
  const h = header.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (h.some(c => c.includes('transactionref') || c.includes('ref1') || c.includes('ref2'))) return 'dbs';
  if (h.some(c => c.includes('transactiondescription')) || (h.includes('date') && h.some(c => c.includes('debit')) && h.length <= 5)) return 'citibank';
  return 'generic';
}

function parseDBS(header: string[], vals: string[]): { amount: number; date: string; note: string; type: string } {
  const row: Record<string, string> = {};
  header.forEach((h, i) => { row[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = (vals[i] || '').trim(); });
  const debit = parseFloat((row['debitamount'] || row['debit'] || '0').replace(/[^\d.-]/g, '')) || 0;
  const credit = parseFloat((row['creditamount'] || row['credit'] || '0').replace(/[^\d.-]/g, '')) || 0;
  const amount = debit > 0 ? debit : credit;
  const type = credit > 0 ? 'income' : 'expense';
  const note = [row['transactionref1'], row['transactionref2'], row['transactionref3'], row['reference']].filter(Boolean).join(' ').trim() || 'DBS Transaction';
  const dateStr = row['transactiondate'] || row['date'] || '';
  return { amount, date: dateStr, note, type };
}

function parseCitibank(header: string[], vals: string[]): { amount: number; date: string; note: string; type: string } {
  const row: Record<string, string> = {};
  header.forEach((h, i) => { row[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = (vals[i] || '').trim(); });
  const debit = parseFloat((row['debit'] || '0').replace(/[^\d.-]/g, '')) || 0;
  const credit = parseFloat((row['credit'] || '0').replace(/[^\d.-]/g, '')) || 0;
  const rawAmount = parseFloat((row['amount'] || '0').replace(/[^\d.-]/g, '')) || 0;
  let amount = debit > 0 ? debit : credit > 0 ? credit : Math.abs(rawAmount);
  let type = credit > 0 ? 'income' : rawAmount > 0 ? 'income' : 'expense';
  if (debit > 0) type = 'expense';
  const note = row['transactiondescription'] || row['description'] || row['narrative'] || 'Citibank Transaction';
  const dateStr = row['date'] || '';
  return { amount, date: dateStr, note, type };
}

function parseGeneric(header: string[], vals: string[]): { amount: number; date: string; note: string; type: string } {
  const row: Record<string, string> = {};
  header.forEach((h, i) => { row[h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()] = (vals[i] || '').trim(); });
  const rawAmount = row['amount'] || row['debit'] || row['transaction amount'] || row['value'] || '0';
  const amount = Math.abs(parseFloat(rawAmount.replace(/[^\d.-]/g, '')) || 0);
  const credit = parseFloat((row['credit'] || '0').replace(/[^\d.-]/g, '')) || 0;
  const type = credit > 0 || parseFloat(rawAmount.replace(/[^\d.-]/g, '')) > 0 ? 'income' : 'expense';
  const date = row['date'] || row['transaction date'] || row['posting date'] || row['value date'] || '';
  const note = row['description'] || row['note'] || row['narrative'] || row['transaction description'] || row['details'] || row['memo'] || '';
  return { amount, date, note, type };
}

// AI categorization using LLM
async function aiCategorize(transactions: { note: string; amount: number; type: string }[]): Promise<Record<number, string>> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey || transactions.length === 0) return {};

  // Batch in groups of 30 max
  const result: Record<number, string> = {};
  const batchSize = 30;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const lines = batch.map((t, idx) => `${i + idx}. [${t.type}] $${t.amount} - "${t.note}"`).join('\n');
    const prompt = `Categorize each transaction into exactly one of these categories:\n${CATEGORIES.join(', ')}\n\nTransactions:\n${lines}\n\nRespond with ONLY a JSON object mapping index to category, like {"0": "Food & Dining", "1": "Transport"}. No explanation.`;

    try {
      const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.4-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1000 }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          Object.entries(parsed).forEach(([k, v]) => {
            const idx = parseInt(k);
            if (!isNaN(idx) && CATEGORIES.includes(v as string)) result[idx] = v as string;
          });
        }
      }
    } catch (e) { console.error('[AI CATEGORIZE]', e); }
  }
  return result;
}

// POST - import CSV transactions with smart parsing + AI categorization
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { transactions, accountId, rawCsv, useAi } = await req.json();

    let parsedTxns: { amount: number; date: string; note: string; type: string; category?: string }[] = [];

    // If rawCsv provided, parse it with bank detection
    if (rawCsv && typeof rawCsv === 'string') {
      const lines = rawCsv.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) return NextResponse.json({ error: 'CSV needs at least a header and one data row' }, { status: 400 });

      // Smart CSV parsing — handle quoted fields
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; }
          else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += char; }
        }
        result.push(current.trim());
        return result;
      };

      const header = parseCsvLine(lines[0]);
      const format = detectBankFormat(header);
      console.log('[IMPORT] Detected format:', format, 'columns:', header);

      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i]);
        if (vals.length < 2) continue;
        let parsed;
        switch (format) {
          case 'dbs': parsed = parseDBS(header, vals); break;
          case 'citibank': parsed = parseCitibank(header, vals); break;
          default: parsed = parseGeneric(header, vals); break;
        }
        if (parsed.amount > 0) parsedTxns.push(parsed);
      }
    } else if (Array.isArray(transactions) && transactions.length > 0) {
      // Legacy: pre-parsed transactions
      parsedTxns = transactions.map(t => ({
        amount: Math.abs(parseFloat(t.amount) || 0),
        date: t.date || '',
        note: t.note || t.description || '',
        type: t.type || 'expense',
        category: t.category,
      })).filter(t => t.amount > 0);
    }

    if (parsedTxns.length === 0) {
      return NextResponse.json({ error: 'No valid transactions found' }, { status: 400 });
    }

    // AI categorization
    let aiCategories: Record<number, string> = {};
    if (useAi !== false) {
      aiCategories = await aiCategorize(parsedTxns.map((t, i) => ({ note: t.note, amount: t.amount, type: t.type })));
    }

    // Fetch rules for auto-categorization
    const rules = await prisma.transactionRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    // Pre-compute dedup hashes for all transactions
    const txnHashes: { hash: string; parsedDate: Date }[] = [];
    for (const t of parsedTxns) {
      let parsedDate = new Date();
      if (t.date) {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) parsedDate = d;
        else {
          const parts = t.date.split(/[\/\-.]/); 
          if (parts.length === 3) {
            const [a, b, c] = parts.map(Number);
            if (c > 1000) parsedDate = new Date(c, b - 1, a);
            else if (a > 1000) parsedDate = new Date(a, b - 1, c);
          }
        }
      }
      txnHashes.push({ hash: computeDedupHash(t.amount, parsedDate, t.note), parsedDate });
    }

    // Find existing duplicates in one query
    const existingHashes = await findDuplicates(userId, txnHashes.map(h => h.hash));
    let skippedDupes = 0;

    let imported = 0;
    for (let i = 0; i < parsedTxns.length; i++) {
      const t = parsedTxns[i];

      // Skip duplicates unless forced
      if (existingHashes.has(txnHashes[i].hash)) {
        skippedDupes++;
        continue;
      }

      let category = t.category || aiCategories[i] || 'Other';
      let tags: string[] = [];

      // Apply rules (rules override AI)
      for (const rule of rules) {
        const conditions = rule.conditions as any[];
        const actions = rule.actions as any[];
        let match = conditions.length > 0;
        for (const cond of conditions) {
          const fieldVal = (cond.field === 'note' ? t.note : cond.field === 'amount' ? String(t.amount) : cond.field === 'type' ? t.type : (t as any)[cond.field] || '').toString().toLowerCase();
          const condVal = (cond.value || '').toLowerCase();
          const numField = parseFloat(fieldVal) || 0;
          const numCond = parseFloat(condVal) || 0;
          switch (cond.op) {
            case 'contains': if (!fieldVal.includes(condVal)) match = false; break;
            case 'contains_phrase': if (!fieldVal.includes(condVal)) match = false; break;
            case 'equals': if (cond.field === 'amount' ? numField !== numCond : fieldVal !== condVal) match = false; break;
            case 'not_equals': if (cond.field === 'amount' ? numField === numCond : fieldVal === condVal) match = false; break;
            case 'starts_with': if (!fieldVal.startsWith(condVal)) match = false; break;
            case 'gt': if (numField <= numCond) match = false; break;
            case 'gte': if (numField < numCond) match = false; break;
            case 'lt': if (numField >= numCond) match = false; break;
            case 'lte': if (numField > numCond) match = false; break;
            case 'wildcard': {
              const regex = new RegExp('^' + condVal.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
              if (!regex.test(fieldVal)) match = false;
              break;
            }
          }
        }
        if (match) {
          for (const act of actions) {
            if (act.type === 'category') category = act.value;
            if (act.type === 'tag') tags.push(act.value);
            if (act.type === 'set_type') t.type = act.value;
            if (act.type === 'set_description') t.note = act.value;
            if (act.type === 'remove_words') {
              const words = act.value.split(/\s+/).filter(Boolean);
              for (const w of words) t.note = t.note.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
            }
          }
        }
      }

      await prisma.transaction.create({
        data: {
          userId,
          amount: t.amount,
          type: t.type,
          category,
          note: t.note || null,
          tags: tags.length > 0 ? tags : undefined,
          accountId: accountId || null,
          date: txnHashes[i].parsedDate,
          dedupHash: txnHashes[i].hash,
        },
      });
      imported++;
    }

    return NextResponse.json({ success: true, imported, skippedDupes, total: parsedTxns.length, format: parsedTxns.length > 0 ? 'detected' : 'manual' });
  } catch (e: any) { return handleApiError(e); }
}
