export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();

    // Get emails where user took an action, grouped by sender domain + action
    const emails = await prisma.email.findMany({
      where: { userId, userAction: { not: null } },
      select: { fromAddress: true, fromName: true, userAction: true, aiCategory: true },
    });

    // Aggregate patterns: sender domain → action → count
    const patternMap = new Map<string, { pattern: string; action: string; count: number }>();

    for (const e of emails) {
      const domain = e.fromAddress.split('@')[1] || e.fromAddress;
      const action = e.userAction!;
      const key = `${domain}::${action}`;
      if (patternMap.has(key)) {
        patternMap.get(key)!.count++;
      } else {
        patternMap.set(key, {
          pattern: `From *@${domain}`,
          action,
          count: 1,
        });
      }
    }

    // Only return patterns with 2+ occurrences, sorted by count desc
    const filters = Array.from(patternMap.values())
      .filter(f => f.count >= 2)
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ filters });
  } catch (e: any) {
    return handleApiError(e);
  }
}
