/**
 * Agent Runtime — Think-Act loop with safety controls.
 *
 * Safety (Fix #1):
 *   (a) Loop detection: hash(tool+args), break if same call repeats
 *   (b) Token ceiling: estimate tokens from message lengths, cap at MAX_TOKENS_PER_RUN
 *   (c) stepsUsed = LLM iterations (not tool calls), consistent on all exit paths
 *
 * Approval (Fix #2):
 *   Sprint 1: approval is TERMINAL. Approving a gated tool executes it and
 *   returns the result. The agent loop is NOT resumed. User starts a new
 *   message to continue. Multi-step flows split at confirm/block boundaries.
 *
 *   KNOWN LIMITATION: Chained actions after a confirm/block tool are dropped.
 *   Example: "clear my week and reschedule" — if the first action needs approval,
 *   subsequent steps are lost. Resume loop deferred to multi-step autonomy phase.
 *
 * System Prompt (Fix #5):
 *   Static identity context (profile, north star, alter ego) is cached.
 *   Only loops, memories, and date are fresh per run.
 */
import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import { executeTool } from './tool-executor';
import { getToolSchemas, TOOL_REGISTRY } from './tools';
import { recallMemories } from './memory';
import crypto from 'crypto';

// ═══ CONFIGURATION ═══
const DEFAULT_STEP_LIMIT = 10;
const MAX_TOKENS_PER_RUN = 50_000;  // Token ceiling per run
const LLM_MODEL = 'claude-sonnet-4-6';
const LLM_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';

// ═══ TOKEN ESTIMATION ═══
// Rough estimate: 1 token ≈ 4 chars for English text
function estimateTokens(messages: any[]): number {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    return sum + Math.ceil(content.length / 4);
  }, 0);
}

// ═══ LOOP DETECTION ═══
function hashToolCall(tool: string, args: any): string {
  return crypto.createHash('md5').update(tool + JSON.stringify(args)).digest('hex');
}

// ═══ SYSTEM PROMPT CACHE ═══
// Static identity rarely changes. Cache for 5 minutes.
let identityCache: { userId: string; prompt: string; cachedAt: number } | null = null;
const IDENTITY_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getStaticIdentity(userId: string): Promise<string> {
  if (identityCache && identityCache.userId === userId && Date.now() - identityCache.cachedAt < IDENTITY_CACHE_TTL) {
    return identityCache.prompt;
  }
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const prompt = `## USER IDENTITY
North Star: ${(profile as any)?.northStar || 'Not set'}
Mission: ${(profile as any)?.mission || 'Not set'}
Identity: ${(profile as any)?.identity || 'Not set'}
Alter Ego: ${(profile as any)?.alterEgoName || 'Not set'}${(profile as any)?.alterEgoDescription ? ` \u2014 ${(profile as any).alterEgoDescription}` : ''}
Mantra: ${(profile as any)?.alterEgoMantra || ''}`;
  identityCache = { userId, prompt, cachedAt: Date.now() };
  return prompt;
}

async function buildAgentSystemPrompt(userId: string): Promise<string> {
  const identity = await getStaticIdentity(userId);

  // Fresh per run: open loops, memories, date
  const [openLoopCount, topLoops, topMemories, pendingDecisions] = await Promise.all([
    prisma.openLoop.count({ where: { userId, status: 'open' } }),
    prisma.openLoop.findMany({
      where: { userId, status: 'open', OR: [{ wakeDate: null }, { wakeDate: { lte: new Date() } }] },
      orderBy: [{ urgency: 'asc' }, { deferCount: 'desc' }],
      take: 5,
    }),
    recallMemories(userId, { type: 'profile', limit: 10 }),
    prisma.decision.count({ where: { userId, status: 'pending' } }),
  ]);

  const loopsList = topLoops.length > 0
    ? topLoops.map((l) => `- [${l.urgency}] ${l.content} (deferred ${l.deferCount}x)`).join('\n')
    : 'None';

  const memoriesList = topMemories.length > 0
    ? topMemories.map((m) => `- [${m.key}]: ${m.content.slice(0, 80)}`).join('\n')
    : 'None';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' });
  const timeStr = now.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });

  const toolNames = Object.values(TOOL_REGISTRY).map((t) => `- ${t.name}: ${t.description} [${t.autonomy}]`).join('\n');

  return `You are the Butler \u2014 an agentic chief-of-staff embedded in Life OS.
You have tools to manage tasks, goals, email, finance, contacts, calendar, journal, open loops, and memory.

## RULES
1. You are a butler, not a chatbot. Act first, explain second.
2. For 'auto' and 'suggest' tools: execute immediately without asking.
3. For 'confirm' and 'block' tools: call the tool (it will pause for user approval).
4. Always use create_loop for new open loops \u2014 it handles dedup automatically.
5. Store important observations as memories (profile for facts, episodic for events, semantic for patterns).
6. Be concise. Max 2-3 sentences unless the user wrote a long message.
7. Use the user's alter ego name when appropriate.
8. When uncertain, list_tasks or recall_memory first before acting.

${identity}

## OPEN LOOPS (${openLoopCount} total, top 5)
${loopsList}

## MEMORIES (top 10 profile)
${memoriesList}

## TODAY
Date: ${dateStr} | Time: ${timeStr} SGT
Open loops: ${openLoopCount} | Pending decisions: ${pendingDecisions}

## AVAILABLE TOOLS
${toolNames}

Autonomy tiers: auto (silent), suggest (execute + show), confirm (needs approval tap), block (needs full preview + approval).
`;
}

// ═══ LLM CALL ═══
async function callLLM(
  messages: any[],
  options: { tools?: any[]; stream?: boolean },
): Promise<{ content: string; toolCalls?: { id: string; name: string; args: Record<string, any> }[] }> {
  const body: any = {
    model: LLM_MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.3,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  if (!choice) throw new Error('LLM returned no choices');

  const msg = choice.message;
  const toolCalls = msg.tool_calls?.map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
  }));

  return { content: msg.content || '', toolCalls };
}

// ═══ AGENT RUNTIME ═══

export interface AgentRunResult {
  runId: string;
  status: 'completed' | 'approval_needed' | 'failed' | 'safety_stopped';
  finalMessage?: string;
  toolCallId?: string;  // if approval_needed
  preview?: string;     // if approval_needed
  transcript: { step: number; thought: string; action?: string; result?: any }[];
}

export async function runAgent(
  userId: string,
  params: {
    trigger: 'user_chat' | 'capture' | 'nightly_ritual' | 'auto_detect' | 'daemon' | 'decision';
    input: string;
    stepLimit?: number;
  },
): Promise<AgentRunResult> {
  const stepLimit = params.stepLimit || DEFAULT_STEP_LIMIT;

  // 1. Create AgentRun record
  const run = await prisma.agentRun.create({
    data: { userId, trigger: params.trigger, stepLimit },
  });

  const transcript: AgentRunResult['transcript'] = [];
  const seenCallHashes = new Set<string>();
  let llmIterations = 0;

  try {
    // 2. Build system prompt
    const systemPrompt = await buildAgentSystemPrompt(userId);
    const toolSchemas = getToolSchemas();

    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: params.input },
    ];

    // 3. Think-Act loop
    for (let step = 0; step < stepLimit; step++) {
      // Safety: token ceiling check
      const tokenEstimate = estimateTokens(messages);
      if (tokenEstimate > MAX_TOKENS_PER_RUN) {
        transcript.push({ step, thought: `[SAFETY] Token ceiling reached (${tokenEstimate} est. tokens). Stopping.` });
        await finalizeRun(run.id, 'completed', transcript, llmIterations);
        return { runId: run.id, status: 'safety_stopped', transcript, finalMessage: 'I reached my processing limit for this request. Please continue with a follow-up message.' };
      }

      // 3a. LLM call
      llmIterations++;
      const llmResponse = await callLLM(messages, { tools: toolSchemas });

      // 3b. No tool calls → done, return text response
      if (!llmResponse.toolCalls?.length) {
        transcript.push({ step, thought: llmResponse.content });
        await finalizeRun(run.id, 'completed', transcript, llmIterations);
        return { runId: run.id, status: 'completed', transcript, finalMessage: llmResponse.content };
      }

      // 3c. Execute tool calls
      for (const tc of llmResponse.toolCalls) {
        // Safety: loop detection
        const callHash = hashToolCall(tc.name, tc.args);
        if (seenCallHashes.has(callHash)) {
          transcript.push({ step, thought: `[SAFETY] Duplicate tool call detected: ${tc.name}. Breaking loop.` });
          await finalizeRun(run.id, 'completed', transcript, llmIterations);
          return {
            runId: run.id, status: 'safety_stopped', transcript,
            finalMessage: 'I noticed I was repeating the same action. Here\'s what I\'ve done so far.',
          };
        }
        seenCallHashes.add(callHash);

        const result = await executeTool(userId, run.id, tc.name, tc.args);
        transcript.push({ step, thought: llmResponse.content || '', action: tc.name, result: result.result });

        // If tool needs approval → pause the loop (Sprint 1: terminal)
        if (result.status === 'approval_needed') {
          await finalizeRun(run.id, 'approval_needed', transcript, llmIterations);
          return {
            runId: run.id, status: 'approval_needed',
            toolCallId: result.toolCallId, preview: result.preview,
            transcript,
          };
        }

        // Feed result back to LLM for next iteration
        messages.push(
          {
            role: 'assistant',
            content: llmResponse.content || null,
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }],
          },
          {
            role: 'tool',
            content: JSON.stringify(result.result),
            tool_call_id: tc.id,
          },
        );
      }
    }

    // Step limit reached
    transcript.push({ step: stepLimit, thought: `[SAFETY] Step limit (${stepLimit}) reached.` });
    await finalizeRun(run.id, 'completed', transcript, llmIterations);
    return { runId: run.id, status: 'completed', transcript, finalMessage: 'I\'ve taken the maximum number of actions for this request.' };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[AGENT] Run failed:', errMsg);
    transcript.push({ step: llmIterations, thought: `[ERROR] ${errMsg}` });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMsg: errMsg, completedAt: new Date(), stepsUsed: llmIterations, transcript: transcript as any },
    });
    return { runId: run.id, status: 'failed', transcript, finalMessage: `Something went wrong: ${errMsg}` };
  }
}

async function finalizeRun(
  runId: string,
  status: string,
  transcript: any[],
  stepsUsed: number,
): Promise<void> {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status,
      transcript: transcript as any,
      stepsUsed,              // always = LLM iterations, consistent
      completedAt: status === 'approval_needed' ? undefined : new Date(),
    },
  });
}
