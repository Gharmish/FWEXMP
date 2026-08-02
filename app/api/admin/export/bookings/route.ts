import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { toCsv } from '@/lib/csv';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { listBookingsForExport } from '@/features/admin/bookings/queries';

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

  // Unbounded export with the full accounting columns — reconcilable
  // against a HyperPay settlement report by capture date.
  const rows = await listBookingsForExport();
  const csv = toCsv(
    [
      'reference',
      'status',
      'payment_status',
      'payment_brand',
      'date',
      'start_time',
      'party_size',
      'total_sar',
      'discount_sar',
      'promo_code',
      'wallet_applied_sar',
      'vat_sar',
      'commission_bps',
      'commission_sar',
      'payout_sar',
      'refunded_sar',
      'forfeited_sar',
      'refund_due_sar',
      'refund_method',
      'experience',
      'guest_name',
      'guest_phone',
      'payment_reference',
      'paid_at',
      'refunded_at',
      'host_paid_at',
      'created_at',
    ],
    rows.map((r) => [
      r.reference,
      r.status,
      r.paymentStatus,
      r.paymentBrand,
      r.date,
      r.startTime,
      r.partySize,
      r.totalAmountSar,
      r.discountSar,
      r.promoCode,
      r.walletAppliedSar,
      r.vatSar,
      r.commissionBps,
      r.commissionSar,
      r.payoutSar,
      r.refundedAmountSar,
      r.forfeitedSar,
      r.refundDueSar,
      r.refundMethod,
      r.experienceTitleEn,
      r.guestName,
      r.guestPhone,
      r.paymentReference,
      r.paidAt,
      r.refundedAt,
      r.hostPaidAt,
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
