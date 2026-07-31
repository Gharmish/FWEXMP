/**
 * Pure iCalendar (RFC 5545) rendering for the booking-confirmation email —
 * no I/O, unit-testable, hand-rolled to keep the no-new-dependencies rule.
 * One VEVENT per booking; times are emitted in UTC (KSA is a fixed +03:00
 * with no DST, so the instant is exact and no VTIMEZONE block is needed).
 */

export interface BookingIcsInput {
  /** Stable UID so re-sent receipts update, not duplicate, the event. */
  uid: string;
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

/** Escape text per RFC 5545 §3.3.11 (TEXT). */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `YYYYMMDDTHHMMSSZ` UTC stamp. */
function icsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Fold long content lines at 75 octets (RFC 5545 §3.1). Splitting at 74
 * UTF-16 units keeps well under the octet limit for our mostly-ASCII
 * property names while remaining simple; continuation lines start with
 * one space.
 */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join('\r\n ');
}

export function renderBookingIcs(input: BookingIcsInput): string {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gharmish//Booking//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(input.uid)}`,
    // DTSTAMP mirrors the start so the output stays deterministic (and
    // therefore testable); clients only use it for update ordering.
    `DTSTAMP:${icsUtc(input.start)}`,
    `DTSTART:${icsUtc(input.start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(input.summary)}`,
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    `DESCRIPTION:${icsEscape(input.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
