import { describe, expect, it } from 'vitest';
import { calendarEventDescription, googleCalendarUrl, googleMapsLink } from './calendar-links';

describe('googleCalendarUrl', () => {
  const input = {
    // 2026-08-05 09:00 KSA == 06:00 UTC
    start: new Date('2026-08-05T09:00:00+03:00'),
    durationMinutes: 180,
    summary: 'Sunset hike, Jabal Sawda',
    location: 'Rijal Almaa Village',
    description: 'Reference: GH-QTW3J9\nhttps://gharmish.com/en/book/confirmed/x',
  };

  it('builds a template link with UTC start/end from the KSA instant', () => {
    const url = new URL(googleCalendarUrl(input));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20260805T060000Z/20260805T090000Z');
    expect(url.searchParams.get('text')).toBe('Sunset hike, Jabal Sawda');
    expect(url.searchParams.get('location')).toBe('Rijal Almaa Village');
    expect(url.searchParams.get('details')).toContain('GH-QTW3J9');
  });

  it('omits the location param when the listing has no place name', () => {
    const url = new URL(googleCalendarUrl({ ...input, location: null }));
    expect(url.searchParams.has('location')).toBe(false);
  });
});

describe('calendarEventDescription', () => {
  it('joins reference, manage URL, and maps link with newlines', () => {
    expect(
      calendarEventDescription({
        referenceLine: 'Reference: GH-QTW3J9',
        manageUrl: 'https://gharmish.com/en/book/confirmed/x',
        mapUrl: googleMapsLink(18.2, 42.5),
      }),
    ).toBe(
      'Reference: GH-QTW3J9\nhttps://gharmish.com/en/book/confirmed/x\nhttps://www.google.com/maps/search/?api=1&query=18.2,42.5',
    );
  });

  it('drops the maps line when the listing is gone', () => {
    expect(
      calendarEventDescription({ referenceLine: 'Reference: GH-X', manageUrl: 'https://g/x' }),
    ).toBe('Reference: GH-X\nhttps://g/x');
  });
});
