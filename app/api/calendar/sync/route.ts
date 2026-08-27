export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// Lightweight iCal parser — avoids node-ical BigInt issue in production builds
function parseICalText(text: string): Array<{
  uid: string; summary: string; description: string; location: string;
  start: Date | null; end: Date | null; allDay: boolean;
}> {
  const events: Array<any> = [];
  // Unfold continuation lines (RFC 5545: lines starting with space/tab are continuations)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    if (!block) continue;

    const getProp = (name: string): string => {
      // Match property with optional params like DTSTART;VALUE=DATE:20240101
      const regex = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm');
      const match = block.match(regex);
      return match ? match[1].trim() : '';
    };

    const uid = getProp('UID');
    const summary = getProp('SUMMARY').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
    const description = getProp('DESCRIPTION').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
    const location = getProp('LOCATION').replace(/\\n/g, ' ').replace(/\\,/g, ',');
    const dtstart = getProp('DTSTART');
    const dtend = getProp('DTEND');

    // Check if all-day (VALUE=DATE format: YYYYMMDD, no time)
    const allDay = /^\d{8}$/.test(dtstart) || block.includes('DTSTART;VALUE=DATE:');

    const parseICalDate = (val: string): Date | null => {
      if (!val) return null;
      // Format: YYYYMMDD or YYYYMMDDTHHmmSSZ or YYYYMMDDTHHMMSS
      const clean = val.replace(/[^0-9TZ]/g, '');
      if (clean.length >= 8) {
        const y = clean.substring(0, 4);
        const m = clean.substring(4, 6);
        const d = clean.substring(6, 8);
        if (clean.length === 8) {
          return new Date(`${y}-${m}-${d}T00:00:00Z`);
        }
        if (clean.length >= 15) {
          const h = clean.substring(9, 11);
          const mi = clean.substring(11, 13);
          const s = clean.substring(13, 15);
          const isUtc = clean.endsWith('Z') || val.endsWith('Z');
          return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}${isUtc ? 'Z' : ''}`);
        }
      }
      // Fallback
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const start = parseICalDate(dtstart);
    const end = parseICalDate(dtend);

    if (start) {
      events.push({ uid, summary, description, location, start, end, allDay });
    }
  }

  return events;
}

// POST sync a calendar subscription from iCal URL
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { subId } = body;

    if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 });

    const sub = await prisma.calendarSubscription.findFirst({ where: { id: subId, userId } });
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    // Fetch iCal feed with timeout
    let icalRes: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      icalRes = await fetch(sub.url, {
        headers: { 'User-Agent': 'Life-OS-Calendar/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchErr: any) {
      const msg = fetchErr?.name === 'AbortError' ? 'Calendar URL timed out' : 'Could not reach calendar URL';
      console.error('[CALENDAR SYNC] Fetch exception:', fetchErr?.message, sub.url);
      // Update sub to mark the error so user knows
      await prisma.calendarSubscription.update({
        where: { id: sub.id },
        data: { lastSynced: new Date() },
      });
      return NextResponse.json({ error: msg, synced: 0, needsAttention: true }, { status: 200 });
    }

    if (!icalRes.ok) {
      console.error('[CALENDAR SYNC] Fetch failed:', icalRes.status, sub.url);
      const hint = icalRes.status === 404
        ? 'Calendar URL returned 404. For Google Calendar, use the Secret address (not public) from Settings → Integrate Calendar.'
        : icalRes.status === 403
        ? 'Calendar is not accessible. Check sharing settings or use the Secret iCal address.'
        : `Calendar returned HTTP ${icalRes.status}`;
      // Don't return 502 — return 200 with error info so client doesn't treat it as a crash
      return NextResponse.json({ error: hint, synced: 0, needsAttention: true }, { status: 200 });
    }

    const icalText = await icalRes.text();
    console.log('[CALENDAR SYNC] Fetched', icalText.length, 'bytes from', sub.name);

    // Parse iCal using lightweight parser
    const parsed = parseICalText(icalText);
    console.log('[CALENDAR SYNC] Parsed', parsed.length, 'events from', sub.name);

    // Delete old events from this subscription
    await prisma.calendarEvent.deleteMany({ where: { subId: sub.id, userId } });

    // Filter events within range
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    const events: any[] = [];
    for (const ev of parsed) {
      if (!ev.start || ev.start < threeMonthsAgo || ev.start > sixMonthsAhead) continue;

      events.push({
        userId, subId: sub.id,
        title: (ev.summary || 'Untitled Event').substring(0, 200),
        description: (ev.description || '').substring(0, 1000) || null,
        startTime: ev.start,
        endTime: ev.end && !isNaN(ev.end.getTime()) ? ev.end : null,
        allDay: ev.allDay,
        location: (ev.location || '').substring(0, 200) || null,
        color: sub.color,
        source: 'subscription',
        externalUid: (ev.uid || '').substring(0, 200),
      });
    }

    if (events.length > 0) {
      await prisma.calendarEvent.createMany({ data: events });
    }

    console.log('[CALENDAR SYNC] Synced', events.length, 'events for', sub.name);

    // Update last synced
    await prisma.calendarSubscription.update({
      where: { id: sub.id },
      data: { lastSynced: new Date() },
    });

    return NextResponse.json({ synced: events.length });
  } catch (e: any) {
    console.error('[CALENDAR SYNC ERROR]', e?.message || e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 });
  }
}
