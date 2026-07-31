import { describe, expect, it } from 'vitest';
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
