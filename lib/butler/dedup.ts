import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import type { OpenLoop } from '@prisma/client';

const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'my', 'i', 'about', 'is', 'it', 'and',
  'of', 'in', 'on', 'at', 'with', 'this', 'that', 'me', 'up', 'do',
]);

/** Normalize text into a sorted, filler-stripped key for exact/fuzzy matching. */
export function generateDedupKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => !FILLER_WORDS.has(w) && w.length > 1)
    .sort()
    .join(' ');
}

/** Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 1;
  return levenshtein(a, b) / Math.max(a.length, b.length);
}

async function bumpExisting(
  existing: OpenLoop,
  params: { content: string; source: string; sourceId?: string },
): Promise<{ action: 'bumped'; loop: OpenLoop }> {
  const ctx = (existing.context as any[]) || [];
  ctx.push({ timestamp: new Date().toISOString(), note: params.content, source: params.source });
  const updated = await prisma.openLoop.update({
    where: { id: existing.id },
    data: { mentionCount: { increment: 1 }, context: ctx as any },
  });
  return { action: 'bumped', loop: updated };
}

async function llmSemanticMatch(
  newContent: string,
  openLoops: { id: string; content: string }[],
): Promise<string | null> {
  try {
    const titles = openLoops.map((l) => `[${l.id}] ${l.content}`).join('\n');
    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          {
            role: 'user',
            content: `Existing open loops:\n${titles}\n\nNew capture: "${newContent}"\n\nIs the new capture the same thing as any existing loop? If yes, return ONLY the matching ID (e.g. "cmq12345"). If no match, return "none".`,
          },
        ],
        max_tokens: 50,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || 'none';
    if (answer === 'none') return null;
    // Validate the returned ID exists in our set
    const match = openLoops.find((l) => answer.includes(l.id));
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Dedup-aware loop creation.
 * Step 1: Exact match on dedupKey (O(1) index lookup)
 * Step 2: Fuzzy match on open loops only (<30 rows)
 * Step 3: LLM semantic match only if >10 open loops and no fuzzy hit
 * Step 4: Create new if no match
 */
export async function dedupAndCreateLoop(
  userId: string,
  params: {
    content: string;
    source: string;
    sourceId?: string;
    type?: string;
    emotion?: string;
    pillar?: string;
    urgency?: string;
    aiConfidence?: number;
  },
): Promise<{ action: 'created' | 'bumped'; loop: OpenLoop }> {
  const dedupKey = generateDedupKey(params.content);

  // Step 1: Exact match
  const exact = await prisma.openLoop.findFirst({
    where: { userId, dedupKey, status: 'open' },
  });
  if (exact) return bumpExisting(exact, params);

  // Step 2: Fuzzy match (only open loops)
  const openLoops = await prisma.openLoop.findMany({
    where: { userId, status: 'open' },
    select: { id: true, dedupKey: true, content: true },
  });
  for (const existing of openLoops) {
    if (existing.dedupKey && levenshteinRatio(dedupKey, existing.dedupKey) < 0.3) {
      const full = await prisma.openLoop.findUnique({ where: { id: existing.id } });
      if (full) return bumpExisting(full, params);
    }
  }

  // Step 3: LLM semantic match (only if >10 open loops)
  if (openLoops.length > 10) {
    const matchId = await llmSemanticMatch(params.content, openLoops);
    if (matchId) {
      const full = await prisma.openLoop.findUnique({ where: { id: matchId } });
      if (full) return bumpExisting(full, params);
    }
  }

  // Step 4: Create new
  const loop = await prisma.openLoop.create({
    data: {
      userId,
      content: params.content,
      dedupKey,
      source: params.source,
      sourceId: params.sourceId ?? null,
      type: params.type || 'task',
      emotion: params.emotion ?? null,
      pillar: params.pillar ?? null,
      urgency: params.urgency || 'medium',
      aiConfidence: params.aiConfidence ?? null,
    },
  });
  await logEvent(userId, 'loop_created', 'open_loop', loop.id, { source: params.source });
  return { action: 'created', loop };
}
