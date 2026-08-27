import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Generate a dedup hash for a transaction.
 * Hash = SHA256(amount_cents | date_YYYYMMDD | normalized_note)
 */
export function computeDedupHash(amount: number, date: Date, note: string | null): string {
  const amountCents = Math.round(Math.abs(amount) * 100);
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const normalizedNote = (note || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
  return crypto.createHash('sha256').update(`${amountCents}|${dateStr}|${normalizedNote}`).digest('hex');
}

/**
 * Check for duplicate transactions by dedup hash.
 * Returns matching transaction IDs.
 */
export async function findDuplicates(
  userId: string,
  hashes: string[]
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const existing = await prisma.transaction.findMany({
    where: { userId, dedupHash: { in: hashes } },
    select: { dedupHash: true },
  });
  return new Set(existing.map(e => e.dedupHash!).filter(Boolean));
}

/**
 * Find potential duplicates using fuzzy matching (same amount ±1 day, similar note).
 * Used for existing transactions without dedup hashes.
 */
export async function findFuzzyDuplicates(
  userId: string,
  amount: number,
  date: Date,
  note: string | null
): Promise<any[]> {
  const dayBefore = new Date(date.getTime() - 86400000);
  const dayAfter = new Date(date.getTime() + 86400000);
  const amountCents = Math.round(Math.abs(amount) * 100);

  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: dayBefore, lte: dayAfter },
    },
    select: { id: true, amount: true, date: true, note: true, category: true, type: true },
  });

  return candidates.filter(c => {
    const cCents = Math.round(Math.abs(c.amount) * 100);
    if (cCents !== amountCents) return false;
    // Same amount, close date — likely dupe
    if (!note || !c.note) return true;
    // Check note similarity (simple overlap)
    const a = note.toLowerCase();
    const b = (c.note || '').toLowerCase();
    return a === b || a.includes(b) || b.includes(a) || similarity(a, b) > 0.6;
  });
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const words1 = new Set(a.split(/\s+/));
  const words2 = new Set(b.split(/\s+/));
  let overlap = 0;
  words1.forEach(w => { if (words2.has(w)) overlap++; });
  return overlap / Math.max(words1.size, words2.size, 1);
}
