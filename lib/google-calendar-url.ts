/**
 * Generate a Google Calendar "Add Event" URL.
 * Opens Google Calendar with the event pre-filled — one tap and it's saved.
 *
 * Google Calendar URL format:
 * https://calendar.google.com/calendar/render?action=TEMPLATE
 *   &text=EVENT_TITLE
 *   &dates=YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ  (UTC)
 *   &details=DESCRIPTION
 *   &location=LOCATION
 */
export function buildGoogleCalendarUrl(event: {
  title: string;
  startTime: string | Date;
  endTime?: string | Date | null;
  description?: string | null;
  location?: string | null;
  allDay?: boolean;
}): string {
  const base = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', event.title);

  const start = new Date(event.startTime);

  if (event.allDay) {
    // All-day: YYYYMMDD format, no time
    const startStr = formatDateOnly(start);
    // End = next day for all-day events
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const endStr = formatDateOnly(end);
    params.set('dates', `${startStr}/${endStr}`);
  } else {
    const startStr = formatDateTimeUTC(start);
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 60 * 60 * 1000); // default 1hr
    const endStr = formatDateTimeUTC(end);
    params.set('dates', `${startStr}/${endStr}`);
  }

  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);

  return `${base}?${params.toString()}`;
}

function formatDateTimeUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Result: YYYYMMDDTHHmmSSZ
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
