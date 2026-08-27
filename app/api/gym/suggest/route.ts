export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — AI suggests a workout based on user prompt
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { prompt, availableEquipment } = body;

    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

    // Get exercise library
    const exercises = await prisma.exercise.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, muscleGroup: true, equipment: true, category: true },
    });

    // Get recent workout history for context
    const recentSessions = await prisma.workoutSession.findMany({
      where: { userId },
      include: { sets: { include: { exercise: { select: { name: true, muscleGroup: true } } } } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    const recentHistory = recentSessions.map(s => ({
      name: s.name,
      date: s.startedAt,
      muscles: [...new Set(s.sets.map(set => set.exercise.muscleGroup))],
    }));

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const equipmentNote = availableEquipment?.length
      ? `Available equipment: ${availableEquipment.join(', ')}. ONLY suggest exercises using this equipment.`
      : 'All standard gym equipment is available.';

    const aiPrompt = `You are a personal trainer AI. The user wants a workout.

User request: "${prompt}"

${equipmentNote}

Recent workout history (to avoid repeating same muscles):
${recentHistory.map(h => `- ${h.name} (${new Date(h.date).toLocaleDateString()}): ${h.muscles.join(', ')}`).join('\n') || 'No recent workouts'}

Available exercises in the library:
${exercises.map(e => `- [${e.id}] ${e.name} (${e.muscleGroup}, ${e.equipment || 'bodyweight'}, ${e.category})`).join('\n')}

Based on the user's request, suggest a complete workout. Return ONLY valid JSON:
{
  "name": "workout name",
  "description": "brief description",
  "targetMuscles": ["muscle1", "muscle2"],
  "durationMins": 45,
  "exercises": [
    {
      "exerciseId": "id_from_library",
      "exerciseName": "Exercise Name",
      "sets": 3,
      "reps": 12,
      "restSeconds": 60,
      "notes": "any form tips or modifications"
    }
  ]
}

Rules:
- Only use exercise IDs from the library above
- Match the user's goal (toning = higher reps/lower weight, strength = lower reps/higher weight, HIIT = circuits)
- Include warm-up exercises if appropriate
- If user specified a time limit, respect it
- Suggest 4-8 exercises for a balanced workout
- Avoid muscles worked in recent sessions unless user specifically requests them`;

    // Retry logic for AI API
    let parsed: any = null;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.4-mini',
            messages: [{ role: 'user', content: aiPrompt }],
            max_tokens: 2000,
            temperature: 0.4,
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error(`[GYM SUGGEST] AI error (attempt ${attempt + 1}):`, aiRes.status, errText);
          if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
          return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 });
        }

        const aiData = await aiRes.json();
        const content = aiData?.choices?.[0]?.message?.content || '';
        console.log('[GYM SUGGEST] AI response length:', content.length);

        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.error(`[GYM SUGGEST] Parse error (attempt ${attempt + 1}):`, content.substring(0, 300));
          if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          return NextResponse.json({ error: 'Failed to parse workout. Please try again.' }, { status: 500 });
        }

        if (parsed?.exercises?.length) break;
        console.warn(`[GYM SUGGEST] No exercises in response (attempt ${attempt + 1})`);
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
      } catch (fetchErr) {
        console.error(`[GYM SUGGEST] Fetch error (attempt ${attempt + 1}):`, fetchErr);
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
        return NextResponse.json({ error: 'Network error reaching AI. Please try again.' }, { status: 502 });
      }
    }

    if (!parsed?.exercises?.length) {
      return NextResponse.json({ error: 'Could not generate a workout. Try a different request.' }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (e: any) { return handleApiError(e); }
}
