export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { runAgent } from '@/lib/butler/agent';

/**
 * POST /api/butler/chat
 * Body: { message: string, trigger?: string }
 * Returns: AgentRunResult (runId, status, finalMessage, toolCallId, preview, transcript)
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { message, trigger } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'No message' }, { status: 400 });
    }

    const result = await runAgent(userId, {
      trigger: (trigger as any) || 'user_chat',
      input: message,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
