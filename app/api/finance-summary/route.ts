export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get month transactions (confirmed only for calculations)
    const monthTxns = await prisma.transaction.findMany({
      where: { userId, date: { gte: startOfMonth }, status: { not: 'pending' }, category: { not: '_email_processed' } },
    });

    // Count pending transactions
    const pendingCount = await prisma.transaction.count({
      where: { userId, status: 'pending' },
    });

    // Get YTD transactions (confirmed only)
    const ytdTxns = await prisma.transaction.findMany({
      where: { userId, date: { gte: startOfYear }, status: { not: 'pending' }, category: { not: '_email_processed' } },
    });

    // Get investments + accounts for unified net worth
    const investments = await prisma.investment.findMany({
      where: { userId },
    });
    const financeAccounts = await prisma.financeAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, type: true, balance: true },
    });

    // Get last 6 months of transactions for trend
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendTxns = await prisma.transaction.findMany({
      where: { userId, date: { gte: sixMonthsAgo }, status: { not: 'pending' }, category: { not: '_email_processed' } },
      orderBy: { date: 'asc' },
    });

    const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const ytdIncome = ytdTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const ytdExpense = ytdTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    // Unified net worth: investments + bank/cash balances - credit debt
    const investmentTotal = investments.reduce((s, i) => s + (i.value ?? 0), 0);
    let accountBalances = 0;
    let creditDebt = 0;
    for (const acct of financeAccounts) {
      if (acct.type === 'investment' || acct.type === 'crypto') continue; // counted via investments
      if (acct.type === 'credit') { creditDebt += Math.abs(acct.balance); }
      else { accountBalances += acct.balance; }
    }
    const netWorth = investmentTotal + accountBalances - creditDebt;

    // Build monthly trend (last 6 months)
    const monthlyTrend: { month: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-SG', { month: 'short' });
      const mTxns = trendTxns.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      });
      monthlyTrend.push({
        month: label,
        income: mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      });
    }

    // Category breakdown for this month
    const categoryBreakdown: Record<string, number> = {};
    monthTxns.filter(t => t.type === 'expense').forEach(t => {
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] ?? 0) + t.amount;
    });

    // Portfolio by platform
    const platformAllocation: Record<string, number> = {};
    investments.forEach(i => {
      platformAllocation[i.platform] = (platformAllocation[i.platform] ?? 0) + (i.value ?? 0);
    });

    return NextResponse.json({
      monthIncome,
      monthExpense,
      ytdIncome,
      ytdExpense,
      netWorth,
      monthlyTrend,
      categoryBreakdown,
      platformAllocation,
      investmentCount: investments.length,
      totalCostBasis: investments.reduce((s, i) => s + (i.costBasis ?? 0), 0),
      pendingCount,
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    console.error('Finance summary error:', e);
    return NextResponse.json({ monthIncome: 0, monthExpense: 0, ytdIncome: 0, ytdExpense: 0, netWorth: 0, monthlyTrend: [], categoryBreakdown: {}, platformAllocation: {} }, { status: 200 });
  }
}
