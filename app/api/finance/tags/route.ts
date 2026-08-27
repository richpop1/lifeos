import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';

export async function GET() {
  const userId = await requireUserId();
  const tags = await prisma.transactionTag.findMany({
    where: { userId },
    orderBy: { fullPath: 'asc' },
  });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const body = await req.json();
  const { name, parentId, color } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Build full path
  let fullPath = name.trim();
  if (parentId) {
    const parent = await prisma.transactionTag.findFirst({ where: { id: parentId, userId } });
    if (parent) fullPath = `${parent.fullPath} / ${name.trim()}`;
  }

  // Upsert to avoid duplicates
  const tag = await prisma.transactionTag.upsert({
    where: { userId_fullPath: { userId, fullPath } },
    update: { color: color || null },
    create: { userId, name: name.trim(), fullPath, parentId: parentId || null, color: color || null },
  });
  return NextResponse.json(tag);
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.transactionTag.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
