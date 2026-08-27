export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// PATCH update transaction
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const data: any = {};
    if (body.amount !== undefined) data.amount = parseFloat(body.amount);
    if (body.type !== undefined) data.type = body.type;
    if (body.investmentType !== undefined) data.investmentType = body.investmentType;
    if (body.category !== undefined) data.category = body.category;
    if (body.note !== undefined) data.note = body.note || null;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.accountId !== undefined) data.accountId = body.accountId || null;
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.status !== undefined) data.status = body.status;
    if (body.matchConfidence !== undefined) data.matchConfidence = parseFloat(body.matchConfidence);
    const txn = await prisma.transaction.updateMany({
      where: { id: params.id, userId },
      data,
    });
    if (txn.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.transaction.findUnique({ where: { id: params.id }, include: { account: { select: { id: true, name: true } } } });
    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}

// DELETE transaction
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const result = await prisma.transaction.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
