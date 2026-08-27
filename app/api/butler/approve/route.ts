export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { approveAndExecute } from '@/lib/butler/tool-executor';

/**
 * POST /api/butler/approve
 * Approve or reject a pending ToolCall.
 * Body: { toolCallId: string, approved: boolean }
 * Sprint 1: approval is TERMINAL — executes the tool, does NOT resume agent loop.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { toolCallId, approved } = await req.json();
    if (!toolCallId) {
      return NextResponse.json({ error: 'toolCallId required' }, { status: 400 });
    }

    const result = await approveAndExecute(userId, toolCallId, approved !== false);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
