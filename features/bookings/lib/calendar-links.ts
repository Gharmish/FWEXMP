/**
 * Pure "add to calendar" helpers — no I/O, unit-testable. Shared by the
 * confirmation page (Google Calendar deep link) and the `.ics` download
 * route, so both surfaces describe the identical event.
 */

export interface CalendarEventInput {
  /** Event start instant (already pinned to the KSA wall-clock). */
  start: Date;
  /** Experience duration; the event end. */
  durationMinutes: number;
  /** Localized experience title. */
  summary: string;
  /** Meeting-point place name, when the listing still has one. */
  location?: string | null;
  /** Free-text body: reference, booking URL, maps link. */
  description: string;
}

/** `YYYYMMDDTHHMMSSZ` UTC stamp (Google's template `dates` format). */
function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Google Calendar event-template deep link. UTC instants — KSA is a
 * fixed +03:00 with no DST, so Google renders the exact local time.
 */
export function googleCalendarUrl(input: CalendarEventInput): string {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.summary,
    dates: `${utcStamp(input.start)}/${utcStamp(end)}`,
    details: input.description,
  });
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Google Maps deep link to a coordinate — the guest-facing meeting
 * point. Mirrors the private copy in `booking-email.ts` (that file is
 * left untouched here; consolidate when it's next edited).
 */
export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * The event body shared by every calendar surface: reference line,
 * manage-booking URL, and (when the listing still exists) the meeting
 * point on Google Maps.
 */
export function calendarEventDescription(input: {
  referenceLine: string;
  manageUrl: string;
  mapUrl?: string | null;
}): string {
  return [input.referenceLine, input.manageUrl, ...(input.mapUrl ? [input.mapUrl] : [])].join('\n');
}
