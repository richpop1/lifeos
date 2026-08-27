export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — generate step-by-step instructions + quick form cues via AI and cache them
// on the exercise row. Instructions/cues are generic reference data (not personal),
// so caching on the shared Exercise row benefits every user and avoids regeneration.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    const exercise = await prisma.exercise.findFirst({
      where: { id: params.id, OR: [{ userId: null }, { userId }] },
    });
    if (!exercise) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const prompt = `You are an expert strength & conditioning coach. Produce a concise how-to for this exercise.

Exercise: ${exercise.name}
Primary muscle group: ${exercise.muscleGroup}
Equipment: ${exercise.equipment || 'bodyweight'}
Type: ${exercise.category || 'general'}

Return ONLY valid JSON in this exact shape:
{
  "guide": "1. step one. 2. step two. 3. step three. ...",  // 4-6 numbered steps describing the movement start to finish
  "cues": ["short actionable cue", "..."]  // 3-5 SHORT form pointers (max ~8 words each): breathing, tempo, common mistakes to avoid
}

Be accurate, safe, and beginner-friendly. Keep each step one sentence.`;

    let parsed: any = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 900,
            temperature: 0.3,
          }),
        });
        if (!aiRes.ok) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
          return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 });
        }
        const aiData = await aiRes.json();
        const content = aiData?.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) { parsed = JSON.parse(jsonMatch[0]); break; }
      } catch (err) {
        if (attempt >= 2) throw err;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!parsed?.guide) {
      return NextResponse.json({ error: 'Could not generate a guide. Please try again.' }, { status: 502 });
    }

    const cues = Array.isArray(parsed.cues) ? parsed.cues.filter((c: any) => typeof c === 'string').slice(0, 6) : [];

    const updated = await prisma.exercise.update({
      where: { id: exercise.id },
      data: { guide: parsed.guide, formCues: cues.length ? cues : undefined },
    });

    return NextResponse.json({ guide: updated.guide, formCues: updated.formCues });
  } catch (e: any) { return handleApiError(e); }
}
