import { describe, expect, it } from 'vitest';
import {
  filterBookings,
  normalizeStatus,
  normalizeView,
} from '@/features/admin/bookings/lib/filter';
import type { AdminBookingRow } from '@/features/admin/bookings/types';

function row(over: Partial<AdminBookingRow>): AdminBookingRow {
  return {
    id: 'id',
    reference: 'ref-abc',
    referenceCode: 'GH-TEST22',
    status: 'pending',
    paymentStatus: 'unpaid',
    refundDueSar: null,
    approvalDeadline: null,
    date: '2026-06-10',
    startTime: '09:00',
    partySize: 2,
    totalAmountSar: 600,
    commissionSar: 90,
    payoutSar: 510,
    commissionBps: 1500,
    currency: 'SAR',
    paymentReference: null,
    createdAt: '2026-05-29T10:00:00.000Z',
    cancellationKind: null,
    cancellationReason: null,
    refundMethod: null,
    walletAppliedSar: 0,
    experienceSlug: 'slug',
    experienceTitleEn: 'Dawn walk',
    guestName: 'Sara',
    guestPhone: '+966 51 234 5678',
    ...over,
  };
}

const today = '2026-05-29';

describe('normalizeStatus / normalizeView', () => {
  it('accepts valid status, falls back to all', () => {
    expect(normalizeStatus('confirmed')).toBe('confirmed');
    expect(normalizeStatus('bogus')).toBe('all');
    expect(normalizeStatus(undefined)).toBe('all');
  });
  it('only upcoming is special', () => {
    expect(normalizeView('upcoming')).toBe('upcoming');
    expect(normalizeView('all')).toBe('all');
    expect(normalizeView(undefined)).toBe('all');
  });
});

describe('filterBookings', () => {
  const rows = [
    row({
      id: 'a',
      status: 'pending',
      date: '2026-06-10',
      guestName: 'Sara',
      reference: 'ref-aaa',
    }),
    row({ id: 'b', status: 'confirmed', date: '2026-05-20', reference: 'ref-bbb' }), // past
    row({
      id: 'c',
      status: 'completed',
      date: '2026-06-01',
      guestName: 'Khalid',
      reference: 'ref-ccc',
    }),
    row({ id: 'd', status: 'cancelled', date: '2026-07-01', reference: 'ref-ddd' }),
  ];

  it('returns all by default', () => {
    expect(filterBookings(rows, { todayStr: today })).toHaveLength(4);
  });

  it('filters by status', () => {
    const out = filterBookings(rows, { status: 'completed', todayStr: today });
    expect(out.map((r) => r.id)).toEqual(['c']);
  });

  it('upcoming keeps only future pending/confirmed, sorted by date', () => {
    const out = filterBookings(rows, { view: 'upcoming', todayStr: today });
    // b is past (excluded), c is completed (excluded), d is cancelled (excluded)
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('upcoming sorts soonest first', () => {
    const future = [
      row({ id: 'x', status: 'confirmed', date: '2026-07-01' }),
      row({ id: 'y', status: 'pending', date: '2026-06-02' }),
    ];
    const out = filterBookings(future, { view: 'upcoming', todayStr: today });
    expect(out.map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('searches reference and guest name', () => {
    expect(filterBookings(rows, { q: 'ref-ccc', todayStr: today }).map((r) => r.id)).toEqual(['c']);
    expect(filterBookings(rows, { q: 'khalid', todayStr: today }).map((r) => r.id)).toEqual(['c']);
  });

  it('searches phone ignoring formatting', () => {
    const out = filterBookings(rows, { q: '0512345678', todayStr: today });
    expect(out.length).toBe(4); // all share the default phone
    expect(filterBookings(rows, { q: '999', todayStr: today })).toHaveLength(0);
  });
});
