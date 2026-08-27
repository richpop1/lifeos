export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// Map an investment platform to the FinanceAccount it belongs to.
const PLATFORM_ACCOUNT: Record<string, { name: string; type: string; provider: string; icon: string }> = {
  'tiger brokers': { name: 'Tiger Brokers', type: 'investment', provider: 'tiger', icon: '🐯' },
  'coinhako': { name: 'Coinhako', type: 'crypto', provider: 'coinhako', icon: '🪙' },
  'crypto.com': { name: 'Crypto.com', type: 'crypto', provider: 'crypto_com', icon: '🪙' },
  'syfe': { name: 'Syfe', type: 'investment', provider: 'syfe', icon: '📈' },
};

function resolvePlatform(platform: string) {
  const key = (platform || '').toLowerCase().trim();
  if (PLATFORM_ACCOUNT[key]) return PLATFORM_ACCOUNT[key];
  // Fallback: a generic investment account named after the platform.
  const name = platform?.trim() || 'Investments';
  return { name, type: 'investment', provider: 'manual', icon: '📈' };
}

// POST: auto-link every unlinked investment to a matching account (create if missing).
export async function POST() {
  try {
    const userId = await requireUserId();

    const unlinked = await prisma.investment.findMany({
      where: { userId, accountId: null },
    });
    if (unlinked.length === 0) {
      return NextResponse.json({ success: true, linked: 0, createdAccounts: 0 });
    }

    const accounts = await prisma.financeAccount.findMany({ where: { userId } });
    // Index existing accounts by lowercased name for reuse.
    const byName = new Map(accounts.map(a => [a.name.toLowerCase().trim(), a]));

    let linked = 0;
    let createdAccounts = 0;

    for (const inv of unlinked) {
      const spec = resolvePlatform(inv.platform);
      const nameKey = spec.name.toLowerCase().trim();
      let account = byName.get(nameKey);
      if (!account) {
        account = await prisma.financeAccount.create({
          data: {
            userId,
            name: spec.name,
            type: spec.type,
            provider: spec.provider,
            currency: inv.currency || 'USD',
            icon: spec.icon,
          },
        });
        byName.set(nameKey, account);
        createdAccounts++;
      }
      await prisma.investment.update({
        where: { id: inv.id },
        data: { accountId: account.id },
      });
      linked++;
    }

    return NextResponse.json({ success: true, linked, createdAccounts });
  } catch (e: any) {
    return handleApiError(e);
  }
}
