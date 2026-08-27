export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { dedupAndCreateLoop } from '@/lib/butler/dedup';

/**
 * POST /api/butler/capture
 * Quick capture → dedupAndCreateLoop.
 * Body: { content, source?, type?, emotion?, pillar?, urgency? }
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'No content' }, { status: 400 });
    }

    const result = await dedupAndCreateLoop(userId, {
      content: body.content,
      source: body.source || 'capture',
      type: body.type,
      emotion: body.emotion,
      pillar: body.pillar,
      urgency: body.urgency,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
