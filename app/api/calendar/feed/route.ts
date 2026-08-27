export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public iCal feed — authenticated by token query param
// Google Calendar subscribes to: https://life-os.abacusai.app/api/calendar/feed?token=<calFeedToken>
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return new NextResponse('Unauthorized', { status: 401 });

    // Find user by feed token
    const profile = await prisma.userProfile.findFirst({ where: { calFeedToken: token } });
    if (!profile) return new NextResponse('Invalid token', { status: 403 });
    const userId = profile.userId;

    // Fetch events from past 30 days + future 365 days
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000);
    const to = new Date(now.getTime() + 365 * 86400000);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        source: 'manual', // Only export user-created events (not synced ones)
        startTime: { gte: from, lte: to },
      },
      orderBy: { startTime: 'asc' },
    });

    // Fetch tasks with due dates
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'done' },
        dueDate: { gte: from, lte: to },
      },
      include: { goal: { select: { title: true } } },
    });

    // Build iCal
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Life OS//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Life OS',
      'X-WR-TIMEZONE:Asia/Singapore',
    ];

    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:event-${e.id}@life-os`);
      if (e.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${fmtDate(e.startTime)}`);
        if (e.endTime) lines.push(`DTEND;VALUE=DATE:${fmtDate(e.endTime)}`);
      } else {
        lines.push(`DTSTART:${fmtDateTime(e.startTime)}`);
        if (e.endTime) lines.push(`DTEND:${fmtDateTime(e.endTime)}`);
      }
      lines.push(`SUMMARY:${escIcal(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${escIcal(e.description)}`);
      if (e.location) lines.push(`LOCATION:${escIcal(e.location)}`);
      lines.push(`DTSTAMP:${fmtDateTime(e.updatedAt || e.createdAt)}`);
      lines.push('END:VEVENT');
    }

    for (const t of tasks) {
      if (!t.dueDate) continue;
      const goalTag = t.goal ? ` [${t.goal.title}]` : '';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:task-${t.id}@life-os`);
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(t.dueDate)}`);
      lines.push(`SUMMARY:📋 ${escIcal(t.title)}${escIcal(goalTag)}`);
      if (t.notes) lines.push(`DESCRIPTION:${escIcal(t.notes)}`);
      lines.push(`DTSTAMP:${fmtDateTime(t.updatedAt || t.createdAt)}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return new NextResponse(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="life-os.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e: any) {
    console.error('[CALENDAR FEED]', e);
    return new NextResponse('Server error', { status: 500 });
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('T')[0];
}

function fmtDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
