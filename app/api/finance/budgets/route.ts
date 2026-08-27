export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET budgets (optionally for a specific month/year)
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const month = parseInt(url.searchParams.get('month') || '') || new Date().getMonth() + 1;
    const year = parseInt(url.searchParams.get('year') || '') || new Date().getFullYear();

    const budgets = await prisma.budget.findMany({
      where: { userId, month, year },
      orderBy: { category: 'asc' },
    });

    // Get actual spending per category for this month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: 'expense', date: { gte: startDate, lt: endDate } },
      select: { category: true, amount: true },
    });

    const spent: Record<string, number> = {};
    transactions.forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });

    const result = budgets.map(b => ({
      ...b,
      spent: spent[b.category] || 0,
      remaining: b.amount - (spent[b.category] || 0),
      pct: b.amount > 0 ? Math.round(((spent[b.category] || 0) / b.amount) * 100) : 0,
    }));

    return NextResponse.json(result);
  } catch (e: any) { return handleApiError(e); }
}

// POST create/update budget
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { category, amount, month, year } = await req.json();
    if (!category || amount == null) return NextResponse.json({ error: 'category and amount required' }, { status: 400 });
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();

    const budget = await prisma.budget.upsert({
      where: { userId_category_month_year: { userId, category, month: m, year: y } },
      create: { userId, category, amount: parseFloat(amount), month: m, year: y },
      update: { amount: parseFloat(amount) },
    });
    return NextResponse.json(budget, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}

// DELETE budget
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.budget.delete({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}
