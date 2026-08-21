import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ whatsappLink: () => null }));
vi.mock('@/features/bookings/queries', () => ({
  getBookingsForGuest: vi.fn(async () => []),
  getHostContactPhoneForBooking: vi.fn(async () => null),
}));
vi.mock('@/features/bookings/lib/link-token', () => ({ bookingManageUrl: () => 'https://x' }));
vi.mock('@/features/bookings/lib/cancel-core', () => ({ cancelBookingCore: vi.fn() }));
vi.mock('@/features/bookings/lib/reschedule-core', () => ({ rescheduleBookingCore: vi.fn() }));
vi.mock('@/features/availability/queries', () => ({ getScheduleDataBySlug: vi.fn() }));
vi.mock('@/features/support/tickets', () => ({ openTicket: vi.fn() }));

import { confirmationPresent, TOOLS } from './tools';

describe('confirmationPresent', () => {
  it('accepts the guest\'s words when they are in the latest message', () => {
    expect(confirmationPresent('yes cancel it', 'Yes, cancel it please')).toBe(true);
  });
  it('is tolerant of Arabic diacritics and spacing', () => {
    expect(confirmationPresent('نعم ألغ الحجز', 'نعم   ألغِ الحجز')).toBe(true);
  });
  it('rejects a quote the guest never wrote', () => {
    expect(confirmationPresent('yes', 'what time do we meet?')).toBe(false);
  });
  it('rejects a long new request that merely contains a yes', () => {
    const long = 'yes ' + 'I also want to ask about something else entirely '.repeat(6);
    expect(confirmationPresent('yes', long)).toBe(false);
  });
  it('rejects empty or one-character quotes', () => {
    expect(confirmationPresent('', 'yes')).toBe(false);
    expect(confirmationPresent('y', 'y')).toBe(false);
  });
});

describe('TOOLS', () => {
  it('never exposes a phone or guest identifier as a parameter', () => {
    const params = TOOLS.flatMap((t) => Object.keys((t.input_schema as { properties: object }).properties));
    expect(params.some((p) => /phone|guest_id|address/.test(p))).toBe(false);
  });
  it('requires a confirmation quote for the two action tools', () => {
    for (const name of ['cancel_booking', 'reschedule_booking']) {
      const tool = TOOLS.find((t) => t.name === name)!;
      expect((tool.input_schema as { required: string[] }).required).toContain('confirmation_quote');
    }
  });
});
