export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { encrypt } from '@/lib/crypto';

// GET all finance accounts with computed balances
export async function GET() {
  try {
    const userId = await requireUserId();
    const accounts = await prisma.financeAccount.findMany({
      where: { userId, isActive: true },
      include: {
        investments: { select: { id: true, value: true, costBasis: true, ticker: true, quantity: true, type: true, assetName: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Strip apiConfig from response
    const safe = accounts.map(a => ({ ...a, apiConfig: a.apiConfig ? '***' : null }));
    return NextResponse.json(safe);
  } catch (e: any) { return handleApiError(e); }
}

// POST create a new finance account
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, type, provider, currency, balance, icon, color, apiCredentials, syncEnabled } = body;
    if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

    let apiConfig: string | null = null;
    if (apiCredentials && typeof apiCredentials === 'object' && Object.keys(apiCredentials).length > 0) {
      apiConfig = encrypt(JSON.stringify(apiCredentials));
    }

    const account = await prisma.financeAccount.create({
      data: {
        userId, name, type,
        provider: provider || 'manual',
        currency: currency || 'SGD',
        balance: parseFloat(balance) || 0,
        icon: icon || null,
        color: color || null,
        apiConfig,
        syncEnabled: syncEnabled ?? false,
      },
    });
    return NextResponse.json({ ...account, apiConfig: account.apiConfig ? '***' : null }, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}
