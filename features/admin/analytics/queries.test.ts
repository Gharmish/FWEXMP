import { describe, expect, it } from 'vitest';
import { statsForWindow, type BookingForAggregation } from '@/features/admin/analytics/queries';

/**
 * The original bug: `statsForWindow` treated `refunded` rows like any
 * other status — it filtered them in-window by `createdAt`, then
 * subtracted `totalAmount` from `gmvSar` (a field the same row was
 * never added to, since the confirmed/completed branch skips
 * refunded). The result was negative GMV clamped to zero plus a
 * refund window aligned to the wrong timestamp.
 *
 * The fix: refunds window by `refundedAt`, refund $$ are no longer
 * subtracted from `gmvSar`, and the refund count reflects "what was
 * refunded in this window" rather than "what was placed and then
 * eventually refunded".
 */

const NOW = new Date('2026-05-23T12:00:00Z');
const TWO_DAYS_AGO = new Date('2026-05-21T12:00:00Z');
const TEN_DAYS_AGO = new Date('2026-05-13T12:00:00Z');
const SIXTY_DAYS_AGO = new Date('2026-03-24T12:00:00Z');

function row(partial: Partial<BookingForAggregation>): BookingForAggregation {
  return {
    id: partial.id ?? 'b1',
    guestId: partial.guestId ?? 'g1',
    experienceId: partial.experienceId ?? 'e1',
    totalAmount: partial.totalAmount ?? 100,
    status: partial.status ?? 'confirmed',
    createdAt: partial.createdAt ?? NOW,
    refundedAt: partial.refundedAt ?? null,
    experienceTitleEn: 'Title',
    experienceSlug: 'title',
    hostId: 'h1',
    hostName: 'Host',
  };
}

const sevenDaysAgoCutoff = new Date('2026-05-16T12:00:00Z');

describe('statsForWindow', () => {
  it('counts confirmed + completed revenue into gmvSar within the window', () => {
    const rows = [
      row({ id: 'a', status: 'confirmed', totalAmount: 100, createdAt: TWO_DAYS_AGO }),
      row({ id: 'b', status: 'completed', totalAmount: 250, createdAt: TWO_DAYS_AGO }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    expect(stats.bookings).toBe(2);
    expect(stats.gmvSar).toBe(350);
  });

  it('excludes confirmed/completed bookings whose createdAt falls outside the window', () => {
    const rows = [row({ status: 'confirmed', totalAmount: 100, createdAt: SIXTY_DAYS_AGO })];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    expect(stats.bookings).toBe(0);
    expect(stats.gmvSar).toBe(0);
  });

  it('does NOT subtract refund amounts from gmvSar (the legacy bug)', () => {
    const rows = [
      row({ id: 'a', status: 'confirmed', totalAmount: 500, createdAt: TWO_DAYS_AGO }),
      row({ id: 'b', status: 'refunded', totalAmount: 1000, refundedAt: TWO_DAYS_AGO }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    // The refund's totalAmount used to be subtracted from gmvSar,
    // producing -500 → clamp to 0. Correct behaviour: refunds don't
    // touch gmvSar (the original revenue was never counted in the
    // confirmed/completed branch).
    expect(stats.gmvSar).toBe(500);
    expect(stats.refunded).toBe(1);
  });

  it('windows a refunded booking by refundedAt, not createdAt', () => {
    // Booking placed 60 days ago, refunded 2 days ago. In a 7-day
    // window the refund should appear (refundedAt is in-window),
    // even though the original booking is not.
    const rows = [
      row({
        status: 'refunded',
        totalAmount: 800,
        createdAt: SIXTY_DAYS_AGO,
        refundedAt: TWO_DAYS_AGO,
      }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    expect(stats.refunded).toBe(1);
  });

  it('excludes a refunded booking whose refundedAt falls outside the window', () => {
    const rows = [
      row({
        status: 'refunded',
        totalAmount: 800,
        createdAt: TEN_DAYS_AGO,
        refundedAt: TEN_DAYS_AGO,
      }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    expect(stats.refunded).toBe(0);
  });

  it('falls back to createdAt for legacy refunded rows that have no refundedAt', () => {
    // Pre-migration rows: status='refunded' but refundedAt=null.
    // Window them by createdAt so they don't vanish from analytics.
    const rows = [
      row({
        status: 'refunded',
        totalAmount: 800,
        createdAt: TWO_DAYS_AGO,
        refundedAt: null,
      }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    expect(stats.refunded).toBe(1);
  });

  it('counts unique guests and active experiences only from revenue rows', () => {
    const rows = [
      row({
        id: 'a',
        status: 'confirmed',
        guestId: 'g1',
        experienceId: 'e1',
        createdAt: TWO_DAYS_AGO,
      }),
      row({
        id: 'b',
        status: 'confirmed',
        guestId: 'g1',
        experienceId: 'e2',
        createdAt: TWO_DAYS_AGO,
      }),
      row({
        id: 'c',
        status: 'pending',
        guestId: 'g2',
        experienceId: 'e3',
        createdAt: TWO_DAYS_AGO,
      }),
      row({
        id: 'd',
        status: 'refunded',
        guestId: 'g3',
        experienceId: 'e4',
        createdAt: TWO_DAYS_AGO,
        refundedAt: TWO_DAYS_AGO,
      }),
    ];
    const stats = statsForWindow(rows, sevenDaysAgoCutoff);
    // g1 appears twice on revenue rows → still 1 unique guest.
    // g2 (pending) and g3 (refunded) should not count.
    expect(stats.uniqueGuests).toBe(1);
    expect(stats.activeExperiences).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.refunded).toBe(1);
  });

  it('uses the whole dataset when cutoff is null (all-time)', () => {
    const rows = [
      row({ status: 'confirmed', totalAmount: 100, createdAt: SIXTY_DAYS_AGO }),
      row({ status: 'completed', totalAmount: 200, createdAt: TWO_DAYS_AGO }),
    ];
    const stats = statsForWindow(rows, null);
    expect(stats.bookings).toBe(2);
    expect(stats.gmvSar).toBe(300);
  });
});
