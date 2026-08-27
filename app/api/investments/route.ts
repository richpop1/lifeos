export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const investments = await prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(investments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const inv = await prisma.investment.create({
      data: {
        userId,
        platform: body.platform,
        assetName: body.assetName,
        ticker: body.ticker ?? null,
        quantity: parseFloat(body.quantity ?? '0'),
        type: body.type ?? 'other',
        value: parseFloat(body.value ?? '0'),
        costBasis: parseFloat(body.costBasis ?? '0'),
        currency: body.currency ?? 'USD',
        renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
        note: body.note ?? null,
      },
    });
    return NextResponse.json(inv, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
