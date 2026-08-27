import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import type { Memory } from '@prisma/client';

// ═══ LAZY DECAY ═══
// No nightly write sweep. Decay is computed at read-time using:
//   effectiveWeight = storedWeight * (1 - decay) ^ daysSince(decayAnchorAt)
// `decayAnchorAt` is set at creation and never bumped by unrelated writes
// (unlike `updatedAt` which resets on any edit/weight-bump, zeroing decay).

function computeEffectiveWeight(m: Pick<Memory, 'weight' | 'decay' | 'decayAnchorAt'>): number {
  if (m.decay <= 0) return m.weight; // permanent memory
  const daysSince = (Date.now() - new Date(m.decayAnchorAt).getTime()) / 86_400_000;
  return m.weight * Math.pow(1 - m.decay, daysSince);
}

/** Store a memory. Profile/semantic: upsert by (userId, type, key). Episodic/working: always insert. */
export async function storeMemory(
  userId: string,
  params: {
    type: 'profile' | 'episodic' | 'semantic' | 'working';
    key: string;
    content: string;
    provenance?: string;
    entityType?: string;
    entityId?: string;
    decay?: number;
    weight?: number;
  },
): Promise<Memory> {
  const weight = params.weight ?? 1.0;
  const decay = params.decay ?? (params.type === 'working' ? 0.1 : params.type === 'episodic' ? 0.03 : 0.01);

  // Profile/semantic: enforce uniqueness at app layer
  if (params.type === 'profile' || params.type === 'semantic') {
    const existing = await prisma.memory.findFirst({
      where: { userId, type: params.type, key: params.key, isArchived: false },
    });
    if (existing) {
      const updated = await prisma.memory.update({
        where: { id: existing.id },
        data: { content: params.content, weight, decay, provenance: params.provenance },
      });
      return updated;
    }
  }

  const mem = await prisma.memory.create({
    data: {
      userId,
      type: params.type,
      key: params.key,
      content: params.content,
      weight,
      decay,
      provenance: params.provenance ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    },
  });
  await logEvent(userId, 'memory_created', 'memory', mem.id, { type: params.type, key: params.key });
  return mem;
}

/** Recall memories with lazy decay applied. Results sorted by effective weight desc. */
export async function recallMemories(
  userId: string,
  params: {
    type?: string;
    keyPrefix?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    minWeight?: number;
  } = {},
): Promise<(Memory & { effectiveWeight: number })[]> {
  const where: any = { userId, isArchived: false };
  if (params.type) where.type = params.type;
  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;
  if (params.keyPrefix) where.key = { startsWith: params.keyPrefix };

  // Fetch more than needed so we can filter by effectiveWeight after computation
  const raw = await prisma.memory.findMany({
    where,
    orderBy: { weight: 'desc' },
    take: (params.limit || 20) * 3,
  });

  const minW = params.minWeight ?? 0.1;
  const results = raw
    .map((m) => ({ ...m, effectiveWeight: computeEffectiveWeight(m) }))
    .filter((m) => m.effectiveWeight >= minW)
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, params.limit || 20);

  return results;
}

/** Batch-archive memories whose effective weight has decayed below threshold. */
export async function archiveDecayedMemories(userId: string): Promise<number> {
  const candidates = await prisma.memory.findMany({
    where: { userId, isArchived: false, decay: { gt: 0 } },
    select: { id: true, weight: true, decay: true, decayAnchorAt: true },
  });
  const toArchive = candidates.filter((m) => computeEffectiveWeight(m) < 0.1).map((m) => m.id);
  if (toArchive.length > 0) {
    await prisma.memory.updateMany({ where: { id: { in: toArchive } }, data: { isArchived: true } });
  }
  return toArchive.length;
}
