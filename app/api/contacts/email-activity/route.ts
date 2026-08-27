export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// Auto-link contacts with email activity
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const contactIds: string[] = body.contactIds || [];

    if (!contactIds.length) return NextResponse.json({});

    // Get contacts with email addresses
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, userId },
      select: { id: true, email: true },
    });

    const emailMap: Record<string, { lastEmailed: string | null; emailCount: number }> = {};

    for (const contact of contacts) {
      if (!contact.email) {
        emailMap[contact.id] = { lastEmailed: null, emailCount: 0 };
        continue;
      }

      const emailAddr = contact.email.toLowerCase();

      // Find emails from/to this contact
      const emails = await prisma.email.findMany({
        where: {
          userId,
          OR: [
            { fromAddress: { contains: emailAddr, mode: 'insensitive' } },
            { toAddress: { contains: emailAddr, mode: 'insensitive' } },
          ],
        },
        orderBy: { date: 'desc' },
        take: 1,
        select: { date: true },
      });

      const count = await prisma.email.count({
        where: {
          userId,
          OR: [
            { fromAddress: { contains: emailAddr, mode: 'insensitive' } },
            { toAddress: { contains: emailAddr, mode: 'insensitive' } },
          ],
        },
      });

      emailMap[contact.id] = {
        lastEmailed: emails[0]?.date?.toISOString() || null,
        emailCount: count,
      };
    }

    return NextResponse.json(emailMap);
  } catch (e: any) {
    return handleApiError(e);
  }
}
