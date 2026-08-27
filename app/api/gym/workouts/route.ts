export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// GET — list workout sessions
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const sessions = await prisma.workoutSession.findMany({
      where: { userId },
      include: {
        sets: { include: { exercise: { select: { name: true, muscleGroup: true } } }, orderBy: { setNumber: 'asc' } },
        template: { select: { name: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(sessions);
  } catch (e: any) { return handleApiError(e); }
}

// POST — create workout session (start or log complete)
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { name, templateId, startedAt, completedAt, durationMins, notes, mood, sets } = body;

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const session = await prisma.workoutSession.create({
      data: {
        userId,
        name,
        templateId: templateId || null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        completedAt: completedAt ? new Date(completedAt) : null,
        durationMins: durationMins || null,
        notes: notes || null,
        mood: mood || null,
      },
    });

    // Create sets if provided
    if (sets && Array.isArray(sets) && sets.length > 0) {
      const setData = sets.map((s: any, i: number) => ({
        sessionId: session.id,
        exerciseId: s.exerciseId,
        setNumber: s.setNumber || i + 1,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        duration: s.duration ?? null,
        distance: s.distance ?? null,
        isWarmup: s.isWarmup || false,
        isDropSet: s.isDropSet || false,
        rpe: s.rpe ?? null,
        notes: s.notes || null,
      }));

      await prisma.workoutSet.createMany({ data: setData });

      // Check and update PRs
      await updatePRs(userId, session.id, sets);
    }

    const full = await prisma.workoutSession.findUnique({
      where: { id: session.id },
      include: {
        sets: { include: { exercise: { select: { name: true, muscleGroup: true } } }, orderBy: { setNumber: 'asc' } },
      },
    });

    return NextResponse.json(full);
  } catch (e: any) { return handleApiError(e); }
}

async function updatePRs(userId: string, sessionId: string, sets: any[]) {
  // Group sets by exercise
  const byExercise: Record<string, any[]> = {};
  for (const s of sets) {
    if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
    byExercise[s.exerciseId].push(s);
  }

  for (const [exerciseId, exerciseSets] of Object.entries(byExercise)) {
    const existingPRs = await prisma.personalRecord.findMany({
      where: { userId, exerciseId },
    });
    const prMap: Record<string, number> = {};
    for (const pr of existingPRs) prMap[pr.recordType] = pr.value;

    const newPRs: { recordType: string; value: number }[] = [];

    for (const s of exerciseSets) {
      if (s.isWarmup) continue;

      // Max weight
      if (s.weight && (!prMap['max_weight'] || s.weight > prMap['max_weight'])) {
        newPRs.push({ recordType: 'max_weight', value: s.weight });
        prMap['max_weight'] = s.weight;
      }

      // Max reps (at any weight)
      if (s.reps && (!prMap['max_reps'] || s.reps > prMap['max_reps'])) {
        newPRs.push({ recordType: 'max_reps', value: s.reps });
        prMap['max_reps'] = s.reps;
      }

      // Max volume (weight * reps)
      if (s.weight && s.reps) {
        const vol = s.weight * s.reps;
        if (!prMap['max_volume'] || vol > prMap['max_volume']) {
          newPRs.push({ recordType: 'max_volume', value: vol });
          prMap['max_volume'] = vol;
        }
      }

      // Estimated 1RM (Epley formula: weight * (1 + reps/30))
      if (s.weight && s.reps && s.reps > 1) {
        const e1rm = s.weight * (1 + s.reps / 30);
        if (!prMap['est_1rm'] || e1rm > prMap['est_1rm']) {
          newPRs.push({ recordType: 'est_1rm', value: Math.round(e1rm * 10) / 10 });
          prMap['est_1rm'] = Math.round(e1rm * 10) / 10;
        }
      }

      // Best time
      if (s.duration && (!prMap['best_time'] || s.duration > prMap['best_time'])) {
        newPRs.push({ recordType: 'best_time', value: s.duration });
        prMap['best_time'] = s.duration;
      }

      // Max distance
      if (s.distance && (!prMap['max_distance'] || s.distance > prMap['max_distance'])) {
        newPRs.push({ recordType: 'max_distance', value: s.distance });
        prMap['max_distance'] = s.distance;
      }
    }

    // Upsert new PRs
    for (const pr of newPRs) {
      await prisma.personalRecord.upsert({
        where: {
          id: existingPRs.find(e => e.recordType === pr.recordType)?.id || 'none',
        },
        update: {
          value: pr.value,
          achievedAt: new Date(),
          sessionId,
        },
        create: {
          userId,
          exerciseId,
          recordType: pr.recordType,
          value: pr.value,
          achievedAt: new Date(),
          sessionId,
        },
      });
    }

    // Mark PR sets
    if (newPRs.length > 0) {
      const sessionSets = await prisma.workoutSet.findMany({
        where: { sessionId, exerciseId },
      });
      // Mark the best set as PR
      const bestSet = sessionSets.reduce((best, s) => {
        const vol = (s.weight || 0) * (s.reps || 0);
        const bestVol = (best.weight || 0) * (best.reps || 0);
        return vol > bestVol ? s : best;
      }, sessionSets[0]);
      if (bestSet) {
        await prisma.workoutSet.update({ where: { id: bestSet.id }, data: { isPR: true } });
      }
    }
  }
}
