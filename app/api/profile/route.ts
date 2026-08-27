export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.userProfile.create({ data: { userId, mission: '', identity: '' } });
    }
    return NextResponse.json(profile);
  } catch (e: any) { return handleApiError(e); }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const updateData: any = {};
    const fields = ['mission', 'identity', 'alterEgoName', 'alterEgoDescription', 'alterEgoTraits', 'alterEgoMantra', 'northStar', 'aiPreferences'];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        mission: body.mission ?? '',
        identity: body.identity ?? '',
        alterEgoName: body.alterEgoName ?? null,
        alterEgoDescription: body.alterEgoDescription ?? null,
        alterEgoTraits: body.alterEgoTraits ?? null,
        alterEgoMantra: body.alterEgoMantra ?? null,
        northStar: body.northStar ?? null,
        aiPreferences: body.aiPreferences ?? null,
      },
    });
    return NextResponse.json(profile);
  } catch (e: any) { return handleApiError(e); }
}
