import { NextResponse } from 'next/server';
import { toCsv } from '@/lib/csv';
import { getHostEarnings } from '@/features/host-earnings/queries';

/**
 * Host earnings statement (CSV) — the "Export" link on /host/earnings.
 * Scoped by the query itself: `getHostEarnings` resolves the host from
 * the session and returns null for non-hosts, so this route leaks
 * nothing to strangers (404, same enumeration posture as /host pages).
 */
export async function GET(): Promise<NextResponse> {
  const earnings = await getHostEarnings();
  if (!earnings) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const csv = toCsv(
    [
      'date',
      'experience',
      'party_size',
      'gross_sar',
      'commission_pct',
      'commission_sar',
      'payout_sar',
      'paid_out_at',
    ],
    earnings.history.map((r) => [
      r.date,
      r.experienceTitleEn,
      r.partySize,
      r.totalSar,
      r.commissionBps / 100,
      r.commissionSar,
      r.payoutSar,
      r.paidOutAt,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gharmish-earnings.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
