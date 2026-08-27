/**
 * Tool executor — wraps command-executor + butler-native tools with audit trail.
 * Every tool call creates a ToolCall record. Autonomy policy sets approved flag.
 */
import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import { TOOL_REGISTRY, BUTLER_TOOL_NAMES, getEffectiveAutonomy } from './tools';
import { executeCommand } from './command-executor';
import { dedupAndCreateLoop } from './dedup';
import { storeMemory, recallMemories } from './memory';

export interface ToolCallResult {
  toolCallId: string;
  status: 'executed' | 'approval_needed' | 'failed';
  result?: any;
  preview?: string;
}

function buildPreview(toolName: string, args: Record<string, any>): string {
  const def = TOOL_REGISTRY[toolName];
  if (!def) return `Execute ${toolName}`;
  const argStr = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`)
    .join(', ');
  return `${def.description} (${argStr})`;
}

/** Execute butler-native tools (not in legacy command executor). */
async function executeButlerTool(userId: string, tool: string, args: Record<string, any>): Promise<any> {
  switch (tool) {
    case 'create_loop': {
      const result = await dedupAndCreateLoop(userId, {
        content: args.content, source: args.source || 'capture',
        sourceId: args.sourceId, type: args.type, emotion: args.emotion,
        pillar: args.pillar, urgency: args.urgency, aiConfidence: args.aiConfidence,
      });
      return { result: `Loop ${result.action}: "${result.loop.content}"`, data: result.loop, action: result.action };
    }
    case 'update_loop': {
      const loop = await prisma.openLoop.findUnique({ where: { id: args.loopId } });
      if (!loop) return { result: `Loop not found: ${args.loopId}` };
      const data: any = { status: args.status };
      if (args.resolution) data.resolution = args.resolution;
      if (args.nextStep) data.nextStep = args.nextStep;
      if (args.status === 'deferred') {
        data.deferCount = { increment: 1 };
        data.wakeDate = args.wakeDate ? new Date(args.wakeDate) : new Date(Date.now() + 86400000);
      }
      if (['pursued', 'cut', 'resolved'].includes(args.status)) data.resolvedAt = new Date();
      const updated = await prisma.openLoop.update({ where: { id: args.loopId }, data });
      await logEvent(userId, `loop_${args.status}`, 'open_loop', args.loopId, { resolution: args.resolution });
      return { result: `Loop ${args.status}: "${updated.content}"`, data: updated, action: args.status };
    }
    case 'list_loops': {
      const where: any = { userId };
      if (args.status) where.status = args.status;
      else where.status = 'open';
      // For open loops, only show those whose wakeDate has passed
      if (where.status === 'open') {
        where.OR = [{ wakeDate: null }, { wakeDate: { lte: new Date() } }];
      }
      const loops = await prisma.openLoop.findMany({
        where, orderBy: [{ urgency: 'asc' }, { deferCount: 'desc' }, { createdAt: 'asc' }],
        take: args.limit || 20,
      });
      if (loops.length === 0) return { result: `No ${args.status || 'open'} loops.` };
      const list = loops.map((l) => `[${l.urgency}] ${l.content} (mentioned ${l.mentionCount}x, deferred ${l.deferCount}x)`).join('\n');
      return { result: `**${loops.length} loops:**\n${list}`, data: loops };
    }
    case 'store_memory': {
      const mem = await storeMemory(userId, {
        type: args.type as any, key: args.key, content: args.content,
        provenance: args.provenance, entityType: args.entityType, entityId: args.entityId,
      });
      return { result: `Memory stored: [${mem.type}] ${mem.key}`, data: mem, action: 'created' };
    }
    case 'recall_memory': {
      const memories = await recallMemories(userId, {
        type: args.type, keyPrefix: args.keyPrefix, limit: args.limit,
      });
      if (memories.length === 0) return { result: 'No matching memories.' };
      const list = memories.map((m) => `[${m.type}] ${m.key}: ${m.content.slice(0, 100)}`).join('\n');
      return { result: `**${memories.length} memories:**\n${list}`, data: memories };
    }
    case 'create_decision': {
      const decision = await prisma.decision.create({
        data: {
          userId, problem: args.problem, options: args.options,
          recommended: args.recommended ?? null, rationale: args.rationale ?? null,
          sourceLoopId: args.sourceLoopId ?? null, urgency: args.urgency || 'medium',
          pillar: args.pillar ?? null,
        },
      });
      await logEvent(userId, 'decision_created', 'decision', decision.id, { problem: args.problem });
      return { result: `Decision created: "${decision.problem}"`, data: decision, action: 'created' };
    }
    case 'log_event': {
      await logEvent(userId, args.type, args.entityType, args.entityId, args.data);
      return { result: `Event logged: ${args.type}`, action: 'logged' };
    }
    default:
      return { result: `Unknown butler tool: ${tool}` };
  }
}

/**
 * Execute a tool with full audit trail.
 * - Creates ToolCall record
 * - Checks autonomy tier → auto/suggest execute immediately, confirm/block pause
 * - Delegates to butler-native or legacy command executor
 * - Logs result + duration
 */
export async function executeTool(
  userId: string,
  agentRunId: string,
  toolName: string,
  args: Record<string, any>,
): Promise<ToolCallResult> {
  const def = TOOL_REGISTRY[toolName];
  if (!def) {
    return { toolCallId: '', status: 'failed', result: { result: `Unknown tool: ${toolName}` } };
  }

  const startMs = Date.now();
  const effectiveAutonomy = getEffectiveAutonomy(toolName, args);
  const autoApprove = effectiveAutonomy === 'auto' || effectiveAutonomy === 'suggest';

  // 1. Create ToolCall record
  const toolCall = await prisma.toolCall.create({
    data: {
      agentRunId,
      tool: toolName,
      args: args as any,
      approved: autoApprove,
      status: autoApprove ? 'approved' : 'pending',
    },
  });

  // 2. If not auto-approved, return early (UI shows approval prompt)
  if (!autoApprove) {
    return {
      toolCallId: toolCall.id,
      status: 'approval_needed',
      preview: buildPreview(toolName, args),
      result: { result: `Awaiting approval: ${buildPreview(toolName, args)}` },
    };
  }

  // 3. Execute
  let result: any;
  try {
    if (BUTLER_TOOL_NAMES.has(toolName)) {
      result = await executeButlerTool(userId, toolName, args);
    } else {
      result = await executeCommand(userId, toolName, args);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.toolCall.update({
      where: { id: toolCall.id },
      data: { status: 'failed', result: { error: errMsg } as any, durationMs: Date.now() - startMs },
    });
    return { toolCallId: toolCall.id, status: 'failed', result: { result: `Error: ${errMsg}` } };
  }

  // 4. Update ToolCall with result
  await prisma.toolCall.update({
    where: { id: toolCall.id },
    data: { status: 'executed', result: result as any, durationMs: Date.now() - startMs },
  });

  // 5. Log event (fire-and-forget)
  await logEvent(userId, 'tool_executed', 'tool_call', toolCall.id, { tool: toolName });

  return { toolCallId: toolCall.id, status: 'executed', result };
}

/**
 * Approve a pending ToolCall and execute it.
 * Sprint 1: approval is TERMINAL — executes the tool and returns the result.
 * The agent loop is NOT resumed after approval. This is intentional:
 * multi-step flows that hit a confirm/block tool produce a result the user sees,
 * and the user can continue the conversation with a new message.
 */
export async function approveAndExecute(
  userId: string,
  toolCallId: string,
  approved: boolean,
): Promise<{ status: 'executed' | 'rejected'; result?: any }> {
  const tc = await prisma.toolCall.findUnique({
    where: { id: toolCallId },
    include: { agentRun: true },
  });
  if (!tc) throw new Error('ToolCall not found');
  if (tc.agentRun.userId !== userId) throw new Error('Unauthorized');
  if (tc.status !== 'pending') throw new Error(`ToolCall already ${tc.status}`);

  if (!approved) {
    await prisma.toolCall.update({
      where: { id: toolCallId },
      data: { status: 'rejected', approved: false },
    });
    await prisma.agentRun.update({
      where: { id: tc.agentRunId },
      data: { status: 'completed', completedAt: new Date() },
    });
    await logEvent(userId, 'tool_rejected', 'tool_call', toolCallId, { tool: tc.tool });
    return { status: 'rejected' };
  }

  // Execute the tool
  const startMs = Date.now();
  let result: any;
  try {
    const args = tc.args as Record<string, any>;
    if (BUTLER_TOOL_NAMES.has(tc.tool)) {
      result = await executeButlerTool(userId, tc.tool, args);
    } else {
      result = await executeCommand(userId, tc.tool, args);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.toolCall.update({
      where: { id: toolCallId },
      data: { status: 'failed', approved: true, approvedAt: new Date(), result: { error: errMsg } as any, durationMs: Date.now() - startMs },
    });
    return { status: 'executed', result: { result: `Error: ${errMsg}` } };
  }

  await prisma.toolCall.update({
    where: { id: toolCallId },
    data: { status: 'executed', approved: true, approvedAt: new Date(), result: result as any, durationMs: Date.now() - startMs },
  });
  // Mark the agent run as completed (terminal — no loop resume in Sprint 1)
  await prisma.agentRun.update({
    where: { id: tc.agentRunId },
    // stepsUsed = LLM iterations only. Approving a gated tool is NOT an iteration.
    data: { status: 'completed', completedAt: new Date() },
  });
  await logEvent(userId, 'tool_executed', 'tool_call', toolCallId, { tool: tc.tool, approved: true });
  return { status: 'executed', result };
}
