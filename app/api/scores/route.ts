export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const scores = await prisma.lifeScore.findMany({ where: { userId }, orderBy: { date: 'asc' } });
    return NextResponse.json(scores);
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const score = await prisma.lifeScore.create({ data: { userId, ...body, date: new Date(body.date) } });
    return NextResponse.json(score, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}
