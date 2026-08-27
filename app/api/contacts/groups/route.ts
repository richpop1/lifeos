export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const groups = await prisma.contactGroup.findMany({
      where: { userId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(groups);
  } catch (e: any) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, color } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const group = await prisma.contactGroup.create({
      data: {
        userId,
        name: name.trim(),
        color: color || '#6B8F71',
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (e: any) {
    return handleApiError(e);
  }
}
