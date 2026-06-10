import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { toCsv } from '@/lib/csv';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { listBookingsForAdmin } from '@/features/admin/bookings/queries';

/**
 * Bookings CSV export for the admin "Export" quick action. The proxy
 * matcher skips /api, so this route carries its own gate: non-admins
 * get 404 (same enumeration posture as the admin layout). The list
 * query is additionally self-gated, so a slip here still exports
 * nothing.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!serverEnv.DATABASE_URL) {
    return NextResponse.json({ error: 'no_db' }, { status: 503 });
  }

  const rows = await listBookingsForAdmin();
  const csv = toCsv(
    [
      'reference',
      'status',
      'payment_status',
      'date',
      'start_time',
      'party_size',
      'total_sar',
      'commission_sar',
      'payout_sar',
      'refund_due_sar',
      'experience',
      'guest_name',
      'guest_phone',
      'payment_reference',
      'created_at',
    ],
    rows.map((r) => [
      r.reference,
      r.status,
      r.paymentStatus,
      r.date,
      r.startTime,
      r.partySize,
      r.totalAmountSar,
      r.commissionSar,
      r.payoutSar,
      r.refundDueSar,
      r.experienceTitleEn,
      r.guestName,
      r.guestPhone,
      r.paymentReference,
      r.createdAt,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gharmish-bookings.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
