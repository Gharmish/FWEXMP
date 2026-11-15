import { describe, expect, it, vi } from 'vitest';
import { renderBookingIcs } from './booking-ics';

describe('renderBookingIcs', () => {
  const input = {
    uid: 'GH-QTW3J9@gharmish.com',
    // 2026-08-05 09:00 KSA == 06:00 UTC
    start: new Date('2026-08-05T09:00:00+03:00'),
    durationMinutes: 180,
    summary: 'Sunset hike, Jabal Sawda; views',
    location: 'Rijal Almaa Village',
    description: 'Reference: GH-QTW3J9\nhttps://gharmish.com/en/book/confirmed/x',
  };

  it('emits a valid VEVENT with UTC times (KSA is fixed +03:00)', () => {
    const ics = renderBookingIcs(input);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:GH-QTW3J9@gharmish.com');
    expect(ics).toContain('DTSTART:20260805T060000Z');
    expect(ics).toContain('DTEND:20260805T090000Z');
    expect(ics).toContain('LOCATION:Rijal Almaa Village');
  });

  it('stamps DTSTAMP with the render time, not the event start (#374)', () => {
    const stamp = new Date('2026-07-01T12:34:56Z');
    expect(renderBookingIcs({ ...input, stamp })).toContain('DTSTAMP:20260701T123456Z');
    // A copy rendered later for an EARLIER start must still carry the later
    // stamp, or calendar clients keep the old date.
    const earlier = renderBookingIcs({
      ...input,
      start: new Date('2026-08-03T09:00:00+03:00'),
      stamp: new Date('2026-07-02T08:00:00Z'),
    });
    expect(earlier).toContain('DTSTART:20260803T060000Z');
    expect(earlier).toContain('DTSTAMP:20260702T080000Z');
  });

  it('defaults DTSTAMP to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    try {
      expect(renderBookingIcs(input)).toContain('DTSTAMP:20260703T000000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('escapes commas, semicolons, and newlines per RFC 5545', () => {
    const ics = renderBookingIcs(input);
    expect(ics).toContain('SUMMARY:Sunset hike\\, Jabal Sawda\\; views');
    expect(ics).toContain('\\nhttps://gharmish');
  });

  it('uses CRLF line endings and folds long lines', () => {
    const ics = renderBookingIcs({ ...input, description: 'x'.repeat(200) });
    expect(ics).toContain('\r\n');
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
