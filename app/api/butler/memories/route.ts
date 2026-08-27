export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { storeMemory } from '@/lib/butler/memory';

// GET: list/filter/search memories
export async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || undefined;
  const provenance = searchParams.get('provenance') || undefined;
  const q = searchParams.get('q') || undefined;
  const showArchived = searchParams.get('archived') === 'true';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const where: any = { userId };
  if (!showArchived) where.isArchived = false;
  if (type) where.type = type;
  if (provenance) where.provenance = provenance;
  if (q) where.content = { contains: q, mode: 'insensitive' };

  const [memories, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.memory.count({ where }),
  ]);

  // Compute effective weight with lazy decay
  const enriched = memories.map((m) => {
    const daysSince = (Date.now() - new Date(m.decayAnchorAt).getTime()) / 86_400_000;
    const effectiveWeight = m.decay <= 0 ? m.weight : m.weight * Math.pow(1 - m.decay, daysSince);
    const isPinned = m.decay === 0;
    return { ...m, effectiveWeight: Math.round(effectiveWeight * 100) / 100, isPinned };
  });

  return NextResponse.json({ memories: enriched, total, page, pages: Math.ceil(total / limit) });
}

// POST: human creates a memory
export async function POST(req: NextRequest) {
  const userId = await requireUserId();

  const body = await req.json();
  const { type, key, content, entityType, entityId } = body;

  if (!type || !key || !content) {
    return NextResponse.json({ error: 'type, key, and content are required' }, { status: 400 });
  }

  const mem = await storeMemory(userId, {
    type,
    key,
    content,
    provenance: 'user_edit',
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    decay: 0, // human-created = pinned by default
    weight: 1.0,
  });

  return NextResponse.json(mem, { status: 201 });
}
