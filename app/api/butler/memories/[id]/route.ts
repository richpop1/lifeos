export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  const mem = await prisma.memory.findFirst({
    where: { id: params.id, userId },
  });
  if (!mem) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mem);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  const existing = await prisma.memory.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const data: any = {};

  if (body.content !== undefined) data.content = body.content;
  if (body.key !== undefined) data.key = body.key;
  if (body.type !== undefined) data.type = body.type;
  if (body.isArchived !== undefined) data.isArchived = body.isArchived;
  // Pin = set decay to 0; Unpin = restore default decay
  if (body.pin === true) data.decay = 0;
  if (body.pin === false) {
    const defaultDecay = existing.type === 'working' ? 0.1 : existing.type === 'episodic' ? 0.03 : 0.01;
    data.decay = defaultDecay;
  }
  if (body.weight !== undefined) data.weight = body.weight;

  const updated = await prisma.memory.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  const existing = await prisma.memory.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.memory.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
