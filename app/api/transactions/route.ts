export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { computeDedupHash } from '@/lib/transaction-dedup';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const accountId = searchParams.get('accountId') || undefined;
    const category = searchParams.get('category') || undefined;
    const status = searchParams.get('status') || undefined;
    const where: any = { userId, category: { not: '_email_processed' } };
    if (accountId) where.accountId = accountId;
    if (category) where.category = category;
    if (status) where.status = status;
    const txns = await prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, take: limit, include: { account: { select: { id: true, name: true } } } });
    return NextResponse.json(txns);
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const amount = parseFloat(body.amount);
    const date = body.date ? new Date(body.date) : new Date();
    const note = body.note ?? null;
    const hash = computeDedupHash(amount, date, note);

    // Manual-entry priority: a manual entry always wins over AI/email-ingested ones.
    // If a duplicate exists that was auto-ingested from email, replace it with this
    // manual entry (delete the AI copy). Only block when the duplicate is itself a
    // manual entry (a genuine user duplicate).
    const existingDupes = await prisma.transaction.findMany({
      where: { userId, dedupHash: hash },
      select: { id: true, source: true },
    });
    if (existingDupes.length > 0 && !body.forceCreate) {
      const manualDupe = existingDupes.find(d => d.source !== 'email_ingest');
      if (manualDupe) {
        return NextResponse.json({ error: 'Duplicate transaction detected', isDuplicate: true, dedupHash: hash }, { status: 409 });
      }
      // All duplicates are AI/email-ingested → manual entry takes precedence, remove them.
      await prisma.transaction.deleteMany({
        where: { id: { in: existingDupes.map(d => d.id) } },
      });
    }

    const txn = await prisma.transaction.create({
      data: {
        userId, amount, type: body.type ?? 'expense',
        investmentType: body.type === 'investment' ? (body.investmentType || null) : null,
        category: body.category, note,
        tags: body.tags || undefined,
        accountId: body.accountId || null,
        date, dedupHash: hash,
        source: 'manual', status: 'confirmed',
      },
    });
    return NextResponse.json(txn, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}
