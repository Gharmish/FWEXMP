import { NextResponse, type NextRequest } from 'next/server';
import { toCsv } from '@/lib/csv';
import { getHostEarnings } from '@/features/host-earnings/queries';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Host earnings statement (CSV) — the "Export" link on /host/earnings.
 * Scoped by the query itself: `getHostEarnings` resolves the host from
 * the session and returns null for non-hosts, so this route leaks
 * nothing to strangers (404, same enumeration posture as /host pages).
 *
 * `from` / `to` (YYYY-MM-DD, inclusive booking-date bounds) mirror the
 * page's range filter so the download matches what's on screen.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const fromParam = sp.get('from');
  const toParam = sp.get('to');
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : undefined;
  const to = toParam && DATE_RE.test(toParam) ? toParam : undefined;

  const earnings = await getHostEarnings({ from, to });
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
      // Timestamped column is UTC (ISO 8601 with Z) — named so a host
      // opening the sheet in Riyadh doesn't misread the hour.
      'paid_out_at_utc',
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
