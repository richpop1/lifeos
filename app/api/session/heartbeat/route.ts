import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/user';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ ok: true }); // Silent fail for unauthenticated

    const now = new Date();
    let sessionContext: any = undefined;

    // Try to parse body (sendBeacon sends empty body)
    try {
      const contentType = req.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const body = await req.json();
        if (body?.lastTab) {
          // Merge with existing sessionContext
          const existing = await prisma.userProfile.findUnique({
            where: { userId },
            select: { sessionContext: true }
          });
          sessionContext = {
            ...(existing?.sessionContext as any || {}),
            lastTab: body.lastTab,
          };
        }
      }
    } catch { /* empty body from sendBeacon, ignore */ }

    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        lastActiveAt: now,
        ...(sessionContext !== undefined ? { sessionContext } : {}),
      },
      create: {
        userId,
        lastActiveAt: now,
        ...(sessionContext !== undefined ? { sessionContext } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[HEARTBEAT]', e?.message);
    return NextResponse.json({ ok: true }); // Never fail visibly
  }
}
