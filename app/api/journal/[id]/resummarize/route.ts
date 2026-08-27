export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — re-run AI summarization on an existing journal entry's chat messages
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const entry = await prisma.journalEntry.findFirst({ where: { id: params.id, userId } });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const chatMessages = entry.chatMessages as any[] | null;
    if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      return NextResponse.json({ error: 'No conversation to summarize' }, { status: 400 });
    }

    const conversationText = chatMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

    const summaryPrompt = `You are extracting a structured razor summary from a journal conversation. You also capture meaningful life moments, ideas, and people mentioned.

Conversation:
${conversationText}

Extract the following fields from the conversation. If a field wasn't discussed, use null. For arrays, use an empty array [] if nothing applies.
Respond with raw JSON only. No code blocks, no markdown.

{
  "dayTitle": "One-line emotional title of the day (string or null)",
  "focusItem": "The ONE thing they committed to focus on (string or null)",
  "cleanWin": "What 'finished' looks like today (string or null)",
  "focusRazor": "What they must ignore/avoid (string or null)",
  "signal": "One pattern, realization, or insight (string or null)",
  "personalMirror": "Owned or Carried / Chose or Reacted (string or null)",
  "humanClose": "One thing they appreciate or want to remember (string or null)",
  "dailyLine": "One sentence worth rereading months later (string or null)",
  "razorSummary": "A 2-3 sentence razor-sharp summary of the session capturing the core truth (string)",
  "keyMemories": [
    {
      "moment": "A short description of the key life moment (string)",
      "context": "Why this matters (string)",
      "emotion": "The dominant emotion (string)",
      "personName": "Name of person involved or null (string or null)"
    }
  ],
  "ideas": [
    {
      "idea": "The idea described clearly (string)",
      "category": "business, creative, side-project, lifestyle, investment, game, tech, other (string)",
      "context": "What sparked this idea (string)"
    }
  ]
}

IMPORTANT: Look for ANY personal sharing — stories, relationships, memories, breakthroughs, failures, celebrations. Also look for ANY creative spark — business ideas, app concepts, "what if" musings.`;

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 1200,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('Re-summarize LLM error:', await response.text().catch(() => ''));
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '{}';
    let summary: any = {};
    try { summary = JSON.parse(content); } catch { summary = {}; }

    const updated = await prisma.journalEntry.update({
      where: { id: params.id },
      data: {
        dayTitle: summary.dayTitle || null,
        focusItem: summary.focusItem || null,
        cleanWin: summary.cleanWin || null,
        focusRazor: summary.focusRazor || null,
        signal: summary.signal || null,
        personalMirror: summary.personalMirror || null,
        humanClose: summary.humanClose || null,
        dailyLine: summary.dailyLine || null,
        razorSummary: summary.razorSummary || null,
        keyMemories: Array.isArray(summary.keyMemories) && summary.keyMemories.length > 0 ? summary.keyMemories : null,
        ideas: Array.isArray(summary.ideas) && summary.ideas.length > 0 ? summary.ideas : null,
      },
      include: { goal: { select: { id: true, title: true } } },
    });

    return NextResponse.json(updated);
  } catch (e: any) { return handleApiError(e); }
}
