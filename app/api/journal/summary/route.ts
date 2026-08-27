export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { storeMemory } from '@/lib/butler/memory';

// Match @mentions and natural name references against contacts
async function detectMentionedContacts(userId: string, conversationText: string) {
  const contacts = await prisma.contact.findMany({
    where: { userId, isArchived: false },
    select: { id: true, name: true, nickname: true, aliases: true },
  });
  if (!contacts.length) return [];

  const matched: { id: string; name: string }[] = [];
  const textLower = conversationText.toLowerCase();

  for (const c of contacts) {
    // Build all name variants: name, nickname, aliases
    const allNames: string[] = [c.name];
    if (c.nickname) allNames.push(c.nickname);
    const aliases = Array.isArray(c.aliases) ? c.aliases as string[] : [];
    allNames.push(...aliases);

    let found = false;

    // Check @mention first (e.g., @Joel, @gf, @girlfriend)
    for (const n of allNames) {
      const atVariant = `@${n.toLowerCase()}`;
      if (textLower.includes(atVariant)) { found = true; break; }
    }
    // Also check @firstName
    if (!found) {
      const atFirst = `@${c.name.split(' ')[0].toLowerCase()}`;
      if (textLower.includes(atFirst)) found = true;
    }

    if (found) {
      matched.push({ id: c.id, name: c.name });
      continue;
    }

    // Check natural name references (word boundary, case-insensitive)
    for (const name of allNames) {
      if (name.length < 3) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(conversationText)) {
        matched.push({ id: c.id, name: c.name });
        found = true;
        break;
      }
    }
  }

  return matched;
}

// Ingest journal keyMemories and ideas into the Memory table (second brain)
async function ingestJournalToMemory(
  userId: string,
  journalEntryId: string,
  summary: any,
  entryDate: Date
) {
  try {
    const keyMemories = Array.isArray(summary.keyMemories) ? summary.keyMemories : [];
    const ideas = Array.isArray(summary.ideas) ? summary.ideas : [];
    const dateStr = entryDate.toISOString().slice(0, 10);

    // Store key memories as episodic memories
    for (let i = 0; i < keyMemories.length; i++) {
      const mem = keyMemories[i];
      if (!mem.moment) continue;
      const content = `${mem.moment}${mem.context ? ' — ' + mem.context : ''}${mem.emotion ? ' [' + mem.emotion + ']' : ''}`;
      await storeMemory(userId, {
        type: 'episodic',
        key: `journal.memory.${dateStr}.${i}`,
        content,
        provenance: 'journal',
        entityType: 'journal',
        entityId: journalEntryId,
        decay: 0.01, // slow decay — memories are precious
        weight: 1.0,
      });
    }

    // Store ideas as semantic knowledge
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      if (!idea.idea) continue;
      const content = `${idea.idea}${idea.context ? ' — ' + idea.context : ''}`;
      await storeMemory(userId, {
        type: 'semantic',
        key: `journal.idea.${dateStr}.${idea.category || 'other'}.${i}`,
        content,
        provenance: 'journal',
        entityType: 'journal',
        entityId: journalEntryId,
        decay: 0.005, // ideas decay even slower
        weight: 1.0,
      });
    }

    // Store razor summary as a semantic snapshot
    if (summary.razorSummary) {
      await storeMemory(userId, {
        type: 'semantic',
        key: `journal.razor.${dateStr}`,
        content: summary.razorSummary,
        provenance: 'journal',
        entityType: 'journal',
        entityId: journalEntryId,
        decay: 0.01,
        weight: 0.9,
      });
    }

    // Store daily line if meaningful
    if (summary.dailyLine) {
      await storeMemory(userId, {
        type: 'episodic',
        key: `journal.dailyline.${dateStr}`,
        content: summary.dailyLine,
        provenance: 'journal',
        entityType: 'journal',
        entityId: journalEntryId,
        decay: 0.005,
        weight: 0.95,
      });
    }
  } catch (err) {
    console.error('Failed to ingest journal to memory:', err);
    // Non-critical — don't fail the journal save
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { sessionType, moodStart, moodEnd, energy, chatMessages, goalId, journalDate, entryId, mediaUrls } = body;
    const entryDate = journalDate ? new Date(journalDate + 'T12:00:00') : new Date();
    const isUpdate = !!entryId;

    const conversationText = (chatMessages || []).map((m: any) => `${m.role}: ${m.content}`).join('\n');

    // Detect mentioned contacts
    const mentionedContacts = await detectMentionedContacts(userId, conversationText);

    // Fetch active goals for auto-detection
    const activeGoals = await prisma.goal.findMany({
      where: { userId, status: 'active' },
      select: { id: true, title: true, pillar: true, description: true },
    });
    const goalsContext = activeGoals.length > 0
      ? `\n\nThe user has these active goals:\n${activeGoals.map(g => `- ID: "${g.id}" | Title: "${g.title}"${g.pillar ? ` | Pillar: ${g.pillar}` : ''}${g.description ? ` | ${g.description}` : ''}`).join('\n')}\n`
      : '';

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
      "moment": "A short description of the key life moment, personal milestone, meaningful conversation, or emotional event (string)",
      "context": "Why this matters or the backstory (string)",
      "emotion": "The dominant emotion: e.g. joy, pride, gratitude, bittersweet, realization, vulnerability (string)",
      "personName": "If this memory involves a specific person, their name. Otherwise null (string or null)"
    }
  ],
  "ideas": [
    {
      "idea": "The idea described clearly (string)",
      "category": "One of: business, creative, side-project, lifestyle, investment, game, tech, other (string)",
      "context": "What sparked this idea or why it was mentioned (string)"
    }
  ],
  "peopleSummaries": [
    {
      "name": "Person's name as mentioned in conversation (string)",
      "summary": "Brief summary of what was discussed about/with this person (string)",
      "sentiment": "positive, neutral, or reflective (string)"
    }
  ],
  "detectedGoalId": "If the conversation clearly relates to one of the user's active goals, return that goal's exact ID string. Otherwise null. Only match if the conversation substantially discusses progress, plans, reflections, or challenges related to a specific goal. Do not force a match. (string or null)"
}

IMPORTANT for keyMemories: Look for ANY personal sharing — stories about people, relationships, childhood memories, breakthroughs, failures, vulnerable moments, celebrations, meaningful encounters, travel stories, family events, friendship moments. If the user shares something personal or emotional, capture it. These are the moments that make a journal invaluable when looking back years later.

IMPORTANT for ideas: Look for ANY creative spark — business ideas, app concepts, game ideas, content ideas, investment opportunities, lifestyle experiments, side projects, "what if" musings. Even half-formed thoughts count.

IMPORTANT for peopleSummaries: Extract summaries for EVERY person mentioned by name in the conversation. This includes @mentions (like @Joel) and natural references (like "had lunch with Sarah"). Capture what was discussed about them, what happened with them, or why they came up.

If the conversation is purely operational (just focus items, no personal sharing), keyMemories, ideas, and peopleSummaries should all be [].
${goalsContext ? `IMPORTANT for detectedGoalId: Review the conversation against the user's active goals listed above. If the journal conversation clearly discusses progress, plans, reflections, or challenges related to a specific goal, return that goal's exact ID. Only match when confidence is high — do not force a match on tangential mentions.` : 'Set detectedGoalId to null (no active goals available).'}\n`;

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
      console.error('Summary LLM error:', await response.text().catch(() => ''));
      if (isUpdate) {
        const entry = await prisma.journalEntry.update({
          where: { id: entryId },
          data: {
            moodEnd, energy,
            chatMessages: chatMessages || [],
            mentionedContactIds: mentionedContacts.length > 0 ? mentionedContacts.map(c => c.id) as any : undefined,
            ...(mediaUrls ? { mediaUrls } : {}),
          },
        });
        return NextResponse.json(entry);
      }
      const entry = await prisma.journalEntry.create({
        data: {
          userId, sessionType, moodStart, moodEnd, energy,
          responses: [], chatMessages: chatMessages || [],
          mentionedContactIds: mentionedContacts.length > 0 ? mentionedContacts.map(c => c.id) as any : undefined,
          goalId: goalId || null,
          date: entryDate,
          ...(mediaUrls ? { mediaUrls } : {}),
        },
      });
      return NextResponse.json(entry, { status: 201 });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '{}';
    let summary: any = {};
    try { summary = JSON.parse(content); } catch { summary = {}; }

    // Determine goalId: explicit user choice > AI-detected > null
    const resolvedGoalId = goalId || summary.detectedGoalId || null;
    // Validate detected goalId actually exists in active goals
    const validGoalId = resolvedGoalId && activeGoals.some(g => g.id === resolvedGoalId) ? resolvedGoalId : (goalId || null);

    const entryData = {
      moodEnd, energy,
      chatMessages: chatMessages || [],
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
      mentionedContactIds: mentionedContacts.length > 0 ? mentionedContacts.map(c => c.id) as any : undefined,
      ...(mediaUrls ? { mediaUrls } : {}),
    };

    let entry;
    if (isUpdate) {
      // Delete old contact notes linked to this entry before re-creating
      await prisma.contactNote.deleteMany({ where: { journalEntryId: entryId } });
      entry = await prisma.journalEntry.update({
        where: { id: entryId },
        data: { ...entryData, goalId: validGoalId },
      });
    } else {
      entry = await prisma.journalEntry.create({
        data: {
          userId, sessionType, moodStart,
          responses: [],
          goalId: validGoalId,
          date: entryDate,
          ...entryData,
        },
      });
    }

    // Auto-create contact notes from people summaries and key memories
    const peopleSummaries = Array.isArray(summary.peopleSummaries) ? summary.peopleSummaries : [];
    const allContacts = await prisma.contact.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true, nickname: true, lastContactedAt: true },
    });

    const contactsByName = new Map<string, typeof allContacts[0]>();
    for (const c of allContacts) {
      contactsByName.set(c.name.toLowerCase(), c);
      if (c.nickname) contactsByName.set(c.nickname.toLowerCase(), c);
      // Also index by aliases
      const aliases = Array.isArray((c as any).aliases) ? (c as any).aliases as string[] : [];
      for (const alias of aliases) {
        if (alias) contactsByName.set(alias.toLowerCase(), c);
      }
    }

    // Create journal_link notes for mentioned people — auto-create contacts if new
    const newlyCreatedContacts: { id: string; name: string }[] = [];
    for (const ps of peopleSummaries) {
      if (!ps.name || !ps.summary) continue;
      let contact = contactsByName.get(ps.name.toLowerCase())
        || mentionedContacts.find(mc => mc.name.toLowerCase() === ps.name.toLowerCase());
      let contactId = contact ? ('id' in contact ? contact.id : null) : null;

      // Auto-create contact if not found
      if (!contactId) {
        try {
          const newContact = await prisma.contact.create({
            data: {
              userId,
              name: ps.name,
              relationship: 'acquaintance',
              lastContactedAt: new Date(),
            },
          });
          contactId = newContact.id;
          newlyCreatedContacts.push({ id: newContact.id, name: ps.name });
          // Add to map so keyMemories can also link
          contactsByName.set(ps.name.toLowerCase(), { id: newContact.id, name: ps.name, nickname: null, lastContactedAt: new Date() });
        } catch (e) {
          console.error('Failed to auto-create contact:', ps.name, e);
          continue;
        }
      }

      await prisma.contactNote.create({
        data: {
          contactId,
          type: 'journal_link',
          content: ps.summary,
          journalEntryId: entry.id,
          date: new Date(),
        },
      });

      // Update lastContactedAt
      if (!newlyCreatedContacts.find(nc => nc.id === contactId)) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { lastContactedAt: new Date() },
        });
      }
    }

    // Also create happy_memory notes from keyMemories that mention a specific person
    const keyMemories = Array.isArray(summary.keyMemories) ? summary.keyMemories : [];
    for (const mem of keyMemories) {
      if (!mem.personName || !mem.moment) continue;
      const contact = contactsByName.get(mem.personName.toLowerCase());
      if (!contact) continue;

      await prisma.contactNote.create({
        data: {
          contactId: contact.id,
          type: 'happy_memory',
          content: `${mem.moment}${mem.context ? ' — ' + mem.context : ''}`,
          journalEntryId: entry.id,
          date: new Date(),
        },
      });
    }

    // Ingest keyMemories and ideas into the second brain (Memory table)
    await ingestJournalToMemory(userId, entry.id, summary, entryDate);

    // Update mentionedContactIds to include newly created contacts
    if (newlyCreatedContacts.length > 0) {
      const existingIds = Array.isArray(entry.mentionedContactIds) ? (entry.mentionedContactIds as string[]) : [];
      const allIds = [...existingIds, ...newlyCreatedContacts.map(nc => nc.id)];
      await prisma.journalEntry.update({
        where: { id: entry.id },
        data: { mentionedContactIds: allIds as any },
      });
      (entry as any).mentionedContactIds = allIds;
    }

    // Include newly created contacts in response so UI can show them
    const responseData = newlyCreatedContacts.length > 0
      ? { ...entry, newContacts: newlyCreatedContacts }
      : entry;
    return NextResponse.json(responseData, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
