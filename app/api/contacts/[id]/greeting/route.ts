export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { occasion, customMessage } = body; // occasion: 'birthday' | 'anniversary' | custom label

    const contact = await prisma.contact.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true, name: true, nickname: true, relationship: true,
        phone: true, interests: true, howWeMet: true, familyNotes: true,
      },
    });
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [profile, user] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    const senderName = user?.name || profile?.alterEgoName || 'me';

    // Recall memories about this person for personalization
    const memories = await prisma.memory.findMany({
      where: { userId, entityType: 'contact', entityId: contact.id, isArchived: false },
      orderBy: { weight: 'desc' },
      take: 5,
      select: { content: true },
    });

    // Also get recent notes
    const recentNotes = await prisma.contactNote.findMany({
      where: { contactId: contact.id },
      orderBy: { date: 'desc' },
      take: 5,
      select: { content: true, type: true },
    });

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const displayName = contact.nickname || contact.name.split(' ')[0];
    const contextParts: string[] = [];
    if (contact.relationship) contextParts.push(`Relationship: ${contact.relationship}`);
    if (contact.interests && Array.isArray(contact.interests) && (contact.interests as string[]).length > 0) {
      contextParts.push(`Interests: ${(contact.interests as string[]).join(', ')}`);
    }
    if (contact.howWeMet) contextParts.push(`How we met: ${contact.howWeMet}`);
    if (contact.familyNotes) contextParts.push(`Family: ${contact.familyNotes}`);
    if (memories.length > 0) contextParts.push(`Memories: ${memories.map(m => m.content).join('; ')}`);
    if (recentNotes.length > 0) contextParts.push(`Recent notes: ${recentNotes.map(n => n.content).join('; ')}`);

    const prompt = `Generate a warm, personal WhatsApp greeting message for ${displayName} for their ${occasion || 'birthday'}.

Context about ${displayName}:
${contextParts.join('\n')}

Sender name: ${senderName}
${customMessage ? `User wants to include: ${customMessage}` : ''}

Rules:
- Keep it personal and heartfelt, not generic
- Use context (shared interests, memories, how you met) to make it feel real
- Keep it concise — 2-4 sentences max, perfect for WhatsApp
- Use emojis sparingly (1-3 max)
- Don't be overly formal
- Write in a natural, conversational tone as if from ${senderName}
- End with something forward-looking (plans to catch up, wishes for the year ahead)

Return ONLY the greeting message, no quotes or explanation.`;

    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.8,
      }),
    });

    if (!res.ok) throw new Error('AI generation failed');
    const data = await res.json();
    const greeting = data.choices?.[0]?.message?.content?.trim() || '';

    // Build WhatsApp link
    const phone = contact.phone?.replace(/[^0-9+]/g, '') || '';
    const waLink = phone ? `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(greeting)}` : null;

    return NextResponse.json({ greeting, waLink, phone: contact.phone });
  } catch (e: any) {
    return handleApiError(e);
  }
}
