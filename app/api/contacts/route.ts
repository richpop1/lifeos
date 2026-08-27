export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const group = searchParams.get('group') || '';
    const relationship = searchParams.get('relationship') || '';
    const showArchived = searchParams.get('archived') === 'true';
    const favoritesOnly = searchParams.get('favorites') === 'true';

    const where: any = { userId, isArchived: showArchived };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { nickname: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (group) where.groupId = group;
    if (relationship) where.relationship = relationship;
    if (favoritesOnly) where.isFavorite = true;

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        group: true,
        notes: { orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy: [{ isFavorite: 'desc' }, { lastContactedAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    });

    return NextResponse.json(contacts);
  } catch (e: any) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, nickname, email, phone, company, role, relationship, groupId, avatar, birthday, howWeMet, interests, familyNotes, socialLinks, catchUpFrequency, isFavorite, customDates } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        userId,
        name: name.trim(),
        nickname: nickname?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        company: company?.trim() || null,
        role: role?.trim() || null,
        relationship: relationship || 'acquaintance',
        groupId: groupId || null,
        avatar: avatar || null,
        birthday: birthday || null,
        howWeMet: howWeMet?.trim() || null,
        interests: interests || null,
        familyNotes: familyNotes?.trim() || null,
        socialLinks: socialLinks || null,
        customDates: customDates || null,
        catchUpFrequency: catchUpFrequency ? parseInt(catchUpFrequency) : null,
        isFavorite: isFavorite || false,
      },
      include: { group: true, notes: true },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (e: any) {
    return handleApiError(e);
  }
}
