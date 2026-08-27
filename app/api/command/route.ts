export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { executeCommand } from '@/lib/butler/command-executor';

// ═══ TOOL DEFINITIONS ═══
// Classification list used by legacy /api/command endpoint.
// The actual execution logic lives in lib/butler/command-executor.ts.

const TOOLS = [
  // ── Tasks ──
  { name: 'add_task', desc: 'Create a task or reminder', params: '{title, description?, dueDate?, priority?: "low"|"medium"|"high", isNeedleMover?: boolean, goalId?, pillar?: "wealth"|"health"|"relationship"}' },
  { name: 'edit_task', desc: 'Update an existing task (title, priority, dueDate, status, description, goalId, pillar, scheduledStartTime, scheduledEndTime, estimatedMins, notes)', params: '{taskTitle: string, updates: {title?, priority?, dueDate?, status?, description?, goalId?, pillar?, isNeedleMover?, scheduledStartTime?, scheduledEndTime?, estimatedMins?, notes?}}' },
  { name: 'resolve_task', desc: 'Mark a task as resolved', params: '{taskTitle, resolution: "completed"|"wont_do"|"delegated"|"deferred"|"irrelevant", reason?, delegatedTo?}' },
  { name: 'delete_task', desc: 'Permanently delete a task', params: '{taskTitle: string}' },
  { name: 'list_tasks', desc: 'List tasks with optional filters', params: '{status?: "todo"|"in-progress"|"done", priority?, goalId?, limit?: number}' },

  // ── Goals ──
  { name: 'add_goal', desc: 'Create a goal', params: '{title, description?, type: "long-term"|"mid-term"|"short-term", pillar?: "wealth"|"health"|"relationship", targetDate?, weight?: 1-10, target?: number, unit?: string}' },
  { name: 'edit_goal', desc: 'Update a goal', params: '{goalTitle: string, updates: {title?, description?, type?, pillar?, status?, progress?, targetDate?, weight?, target?, current?, unit?}}' },
  { name: 'delete_goal', desc: 'Delete a goal', params: '{goalTitle: string}' },
  { name: 'list_goals', desc: 'List active goals', params: '{status?: "active"|"completed"|"archived"}' },

  // ── Habits ──
  { name: 'add_habit', desc: 'Create a new habit', params: '{title, description?, pillar?, frequency?: "daily"|"weekdays"|"custom", customDays?: number[], targetTime?, icon?, color?, goalId?}' },
  { name: 'edit_habit', desc: 'Update a habit', params: '{habitTitle: string, updates: {title?, description?, pillar?, frequency?, customDays?, targetTime?, icon?, color?, isActive?, goalId?}}' },
  { name: 'log_habit', desc: 'Log a habit as done today', params: '{habitTitle: string}' },
  { name: 'delete_habit', desc: 'Delete a habit', params: '{habitTitle: string}' },

  // ── Finance ──
  { name: 'add_transaction', desc: 'Log a transaction', params: '{amount: number, category: string, note?: string, type: "expense"|"income"|"transfer"|"refund"|"investment"|"iou", investmentType?: "buy"|"sell"|"dividend"|"capital_gain", date?, tags?: string[], accountId?}' },
  { name: 'query_spending', desc: 'Query spending', params: '{category?: string, period?: "today"|"week"|"month"|"year", question: string}' },

  // ── Journal ──
  { name: 'quick_journal', desc: 'Save a quick thought/note', params: '{note: string}' },
  { name: 'query_journal', desc: 'Search journal entries', params: '{question: string}' },

  // ── Contacts / People ──
  { name: 'add_contact', desc: 'Add a person to contacts', params: '{name, email?, phone?, company?, role?, relationship?: "family"|"close_friend"|"friend"|"work"|"mentor"|"acquaintance", birthday?, howWeMet?, interests?: string[], catchUpFrequency?: number}' },
  { name: 'edit_contact', desc: 'Update a contact', params: '{contactName: string, updates: {name?, email?, phone?, company?, role?, relationship?, birthday?, howWeMet?, interests?, catchUpFrequency?, isFavorite?}}' },
  { name: 'add_contact_note', desc: 'Add a note to a contact', params: '{contactName: string, content: string, type?: "note"|"meeting"|"call"|"catch_up"|"happy_memory"}' },
  { name: 'query_contacts', desc: 'Look up contact info', params: '{name: string, question?: string}' },

  // ── Calendar ──
  { name: 'add_event', desc: 'Create a calendar event', params: '{title, startTime, endTime?, location?, allDay?: boolean, color?}' },
  { name: 'edit_event', desc: 'Edit a calendar event', params: '{eventTitle: string, updates: {title?, startTime?, endTime?, location?, allDay?, color?}}' },
  { name: 'delete_event', desc: 'Delete a calendar event', params: '{eventTitle: string}' },

  // ── Life Scores ──
  { name: 'update_scores', desc: 'Update life scores (each 1-10)', params: '{activeIncome?, passiveIncome?, riskManagement?, personalBudget?, physical?, emotional?, mental?, spiritual?, partner?, family?, friends?, community?, note?: string}' },

  // ── Settings / Preferences ──
  { name: 'update_preference', desc: 'Update an AI preference or setting', params: '{key: string, value: any, description?: string}' },
  { name: 'update_profile', desc: 'Update user profile fields', params: '{mission?, identity?, alterEgoName?, alterEgoDescription?, alterEgoMantra?, northStar?}' },

  // ── Email ──
  { name: 'email_action', desc: 'Take action on emails', params: '{action: "archive"|"delete"|"star"|"unstar"|"mark_read", emailSubject?: string, emailFrom?: string, count?: number}' },

  // ── General ──
  { name: 'query_general', desc: 'Answer general questions using all data', params: '{question: string}' },
];

// ═══ MAIN HANDLER ═══
// Thin wrapper: LLM classifies the command → delegates to extracted executeCommand.

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { text, history: chatHistory } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: 'No command' }, { status: 400 });

    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { aiPreferences: true, northStar: true, alterEgoName: true, alterEgoMantra: true } });
    const prefs = profile?.aiPreferences as Record<string, any> | null;

    // Build conversation context from history
    const historyContext = chatHistory?.length
      ? `\nRecent conversation:\n${chatHistory.slice(-6).map((m: any) => `${m.role}: ${m.content}`).join('\n')}\n`
      : '';

    const classifyPrompt = `You are the AI brain of a personal Life OS for ${profile?.alterEgoName || 'the user'}. You have full control over their tasks, goals, habits, finances, contacts, calendar, journal, life scores, and settings.

Available tools:
${TOOLS.map(t => `- ${t.name}: ${t.desc} → ${t.params}`).join('\n')}
${prefs ? `\nUser preferences: ${JSON.stringify(prefs)}` : ''}${profile?.northStar ? `\nNorth star: ${profile.northStar}` : ''}${historyContext}
Today: ${new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })}
Current time: ${new Date().toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' })}

User: "${text}"

Pick the best tool and extract parameters. For multiple actions, pick the MOST IMPORTANT one.
For dates, use ISO format. Compute relative dates from today.
Respond ONLY with JSON: {"tool": "tool_name", "params": {...}}`;

    const classifyRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-5.4-mini', messages: [{ role: 'user', content: classifyPrompt }], max_tokens: 400, temperature: 0.1, response_format: { type: 'json_object' } }),
    });

    if (!classifyRes.ok) {
      return NextResponse.json({ result: 'AI service unavailable. Try again.' });
    }

    const content = (await classifyRes.json())?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { tool: 'query_general', params: { question: text } }; }

    const { tool, params: toolParams } = parsed;
    const result = await executeCommand(userId, tool, toolParams || {});

    return NextResponse.json({ ...result, tool, params: toolParams });
  } catch (error) {
    return handleApiError(error);
  }
}
