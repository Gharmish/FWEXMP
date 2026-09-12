import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decryptPii } from '@/lib/pii-crypto';
import { reportError } from '@/lib/log';
import { splitCommission } from '@/features/bookings/lib/commission';
import type { AdminBookingRow } from '@/features/admin/bookings/types';
import { adminGuard } from '@/features/admin/guard';
import { bookings, experiences, guests, hosts } from '@/db/schema';
import {
  bookingFilterOrder,
  bookingFilterWhere,
  type BookingFilter,
} from '@/features/admin/bookings/lib/filter';

/**
 * Admin reads over bookings. Same two gates as the other admin
 * surfaces: caller must be admin, DB must be configured.
 *
 * The list is unfiltered by design at this scale — we have tens of
 * bookings, not tens of thousands. When volume justifies, add a
 * status filter on the route and a server-side WHERE.
 *
 * PII note: this surface returns the guest's phone number in
 * cleartext. The admin layout gate is the only thing protecting it —
 * do not call `listBookingsForAdmin` from anywhere except a route
 * that's a child of `app/[locale]/admin/`.
 */

/** Safety cap on the unfiltered list. We assume hundreds at launch;
 * this is a hard ceiling so a misconfigured page never renders the
 * entire table. Promote to a filtered/paginated query when we cross it. */
export const BOOKINGS_LIST_LIMIT = 500;

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

/**
 * The admin queue, filtered and ordered IN SQL (2026-09 engineering
 * audit DATA-04 / PERF-06) and hydrating only the columns the list
 * renders (DATA-05 — the relational query pulled every one of the
 * table's ~95 columns, encrypted refund IBAN included). Capped at
 * BOOKINGS_LIST_LIMIT after filtering, so a search reaches every
 * booking, not the newest 500.
 */
export async function listBookingsForAdmin(
  filter: BookingFilter = { todayStr: '0000-00-00' },
): Promise<readonly AdminBookingRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db
      .select({
        id: bookings.id,
        idempotencyKey: bookings.idempotencyKey,
        referenceCode: bookings.referenceCode,
        status: bookings.status,
        paymentStatus: bookings.paymentStatus,
        refundDueSar: bookings.refundDueSar,
        refundBankReady: sql<boolean>`(${bookings.refundBankName} is not null and ${bookings.refundBeneficiaryName} is not null and ${bookings.refundIban} is not null)`,
        approvalDeadline: bookings.approvalDeadline,
        date: bookings.date,
        startTime: bookings.startTime,
        partySize: bookings.partySize,
        totalAmount: bookings.totalAmount,
        commissionBps: bookings.commissionBps,
        vatRateBps: bookings.vatRateBps,
        discountSar: bookings.discountSar,
        walletAppliedSar: bookings.walletAppliedSar,
        currency: bookings.currency,
        paymentReference: bookings.paymentReference,
        createdAt: bookings.createdAt,
        cancellationKind: bookings.cancellationKind,
        cancellationReason: bookings.cancellationReason,
        refundMethod: bookings.refundMethod,
        contactPhone: bookings.contactPhone,
        experienceSlug: experiences.slug,
        experienceTitleEn: experiences.titleEn,
        hostStatus: hosts.verificationStatus,
        guestName: guests.name,
        guestPhone: guests.phone,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(hosts, eq(experiences.hostId, hosts.id))
      .innerJoin(guests, eq(bookings.guestId, guests.id))
      .where(bookingFilterWhere(filter))
      .orderBy(...bookingFilterOrder(filter))
      .limit(BOOKINGS_LIST_LIMIT);
    return rows.map<AdminBookingRow>((row) => {
      // Snapshot on the booking — a later commission edit never restates
      // what this booking owes the host.
      const { commissionSar, payoutSar } = splitCommission(
        row.totalAmount,
        row.commissionBps,
        row.vatRateBps,
        row.discountSar,
        row.walletAppliedSar,
      );
      return {
        id: row.id,
        reference: row.idempotencyKey,
        referenceCode: row.referenceCode,
        status: row.status,
        paymentStatus: row.paymentStatus,
        refundDueSar: row.refundDueSar,
        refundBankReady: row.refundBankReady,
        hostSuspended: row.hostStatus === 'suspended',
        approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
        date: row.date,
        startTime: row.startTime,
        partySize: row.partySize,
        totalAmountSar: row.totalAmount,
        commissionSar,
        payoutSar,
        commissionBps: row.commissionBps,
        currency: row.currency,
        paymentReference: row.paymentReference,
        createdAt: row.createdAt.toISOString(),
        cancellationKind: row.cancellationKind,
        cancellationReason: row.cancellationReason,
        refundMethod: row.refundMethod,
        walletAppliedSar: row.walletAppliedSar,
        experienceSlug: row.experienceSlug,
        experienceTitleEn: row.experienceTitleEn,
        guestName: row.guestName,
        guestPhone: row.contactPhone ?? row.guestPhone,
      };
    });
  } catch (error) {
    // Rethrow: an empty return rendered "No bookings yet" on DB failures,
    // making the admin error boundary unreachable dead code.
    reportError(error, { surface: 'admin:listBookings' });
    throw error;
  }
}

export interface AdminBookingExportRow extends AdminBookingRow {
  paymentBrand: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  hostPaidAt: string | null;
  /**
   * The full money decomposition (2026-08-01 ninth audit): without
   * these, exported rows were non-additive on any promo/credit booking
   * (`payout > total − commission` with nothing explaining why) and
   * refunds reconciled by date only, never amount. With them the
   * identity `vat + commission + payout = total + discount + wallet`
   * holds on every row.
   */
  discountSar: number;
  promoCode: string | null;
  vatSar: number;
  refundedAmountSar: number | null;
  forfeitedSar: number | null;
}

/**
 * Full booking set for the accounting CSV export. UNBOUNDED on purpose —
 * an export that silently truncates reads as "everything" when it isn't.
 * Carries the settlement/refund/payout timestamps the list view omits,
 * so a HyperPay settlement report can be reconciled by capture date.
 */
export async function listBookingsForExport(): Promise<readonly AdminBookingExportRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db.query.bookings.findMany({
      with: {
        experience: { columns: { slug: true, titleEn: true } },
        guest: { columns: { name: true, phone: true } },
      },
      orderBy: (b) => desc(b.createdAt),
    });
    return rows.map<AdminBookingExportRow>((row) => {
      const { commissionSar, payoutSar, vatSar } = splitCommission(
        row.totalAmount,
        row.commissionBps,
        row.vatRateBps,
        row.discountSar,
        row.walletAppliedSar,
      );
      return {
        id: row.id,
        reference: row.idempotencyKey,
        referenceCode: row.referenceCode,
        status: row.status,
        paymentStatus: row.paymentStatus,
        refundDueSar: row.refundDueSar,
        approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
        date: row.date,
        startTime: row.startTime,
        partySize: row.partySize,
        totalAmountSar: row.totalAmount,
        commissionSar,
        payoutSar,
        commissionBps: row.commissionBps,
        currency: row.currency,
        paymentReference: row.paymentReference,
        createdAt: row.createdAt.toISOString(),
        cancellationKind: row.cancellationKind,
        cancellationReason: row.cancellationReason,
        refundMethod: row.refundMethod,
        walletAppliedSar: row.walletAppliedSar,
        experienceSlug: row.experience.slug,
        experienceTitleEn: row.experience.titleEn,
        guestName: row.guest.name,
        guestPhone: row.contactPhone ?? row.guest.phone,
        paymentBrand: row.paymentBrand,
        paidAt: row.paidAt?.toISOString() ?? null,
        refundedAt: row.refundedAt?.toISOString() ?? null,
        hostPaidAt: row.hostPaidAt?.toISOString() ?? null,
        discountSar: row.discountSar,
        promoCode: row.promoCode,
        vatSar,
        refundedAmountSar: row.refundedAmountSar,
        forfeitedSar: row.forfeitedSar,
      };
    });
  } catch (error) {
    // Rethrow: a silently empty CSV export is worse than a failed one.
    reportError(error, { surface: 'admin:listBookingsForExport' });
    throw error;
  }
}

/** Single booking by id for the admin detail page. */
export async function getAdminBookingById(id: string): Promise<AdminBookingRow | undefined> {
  const block = await adminGuard();
  if (block) return undefined;
  try {
    const row = await db.query.bookings.findFirst({
      where: (b) => eq(b.id, id),
      with: {
        experience: { columns: { slug: true, titleEn: true, commissionBps: true } },
        guest: { columns: { name: true, phone: true } },
      },
    });
    if (!row) return undefined;
    const { commissionSar, payoutSar } = splitCommission(
      row.totalAmount,
      row.commissionBps,
      row.vatRateBps,
      row.discountSar,
      row.walletAppliedSar,
    );
    return {
      id: row.id,
      reference: row.idempotencyKey,
      referenceCode: row.referenceCode,
      status: row.status,
      paymentStatus: row.paymentStatus,
      refundDueSar: row.refundDueSar,
      refundBankReady: Boolean(row.refundBankName && row.refundBeneficiaryName && row.refundIban),
      refundBank:
        row.refundBankName && row.refundBeneficiaryName && row.refundIban
          ? {
              bankName: row.refundBankName,
              beneficiaryName: row.refundBeneficiaryName,
              iban: decryptPii(row.refundIban),
              submittedAt: row.refundBankDetailsAt?.toISOString() ?? null,
            }
          : null,
      /** Set = an unmatched capture blocks the guest from paying again. */
      settleAnomalyAt: row.settleAnomalyAt?.toISOString() ?? null,
      settleAnomalyKind: row.settleAnomalyKind,
      approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
      date: row.date,
      startTime: row.startTime,
      partySize: row.partySize,
      totalAmountSar: row.totalAmount,
      commissionSar,
      payoutSar,
      commissionBps: row.commissionBps,
      currency: row.currency,
      paymentReference: row.paymentReference,
      createdAt: row.createdAt.toISOString(),
      cancellationKind: row.cancellationKind,
      cancellationReason: row.cancellationReason,
      refundMethod: row.refundMethod,
      walletAppliedSar: row.walletAppliedSar,
      experienceSlug: row.experience.slug,
      experienceTitleEn: row.experience.titleEn,
      guestName: row.guest.name,
      guestPhone: row.contactPhone ?? row.guest.phone,
    };
  } catch (error) {
    // Rethrow: undefined means "no such booking" — an error must not 404.
    reportError(error, { surface: 'admin:getBookingById', id });
    throw error;
  }
}

/** Coarse counts so the list page can show "{n} pending · {n} confirmed". */
export interface AdminBookingTotals {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  refunded: number;
  declined: number;
  expired: number;
}

export function totalsFromRows(rows: readonly AdminBookingRow[]): AdminBookingTotals {
  const out: AdminBookingTotals = {
    total: rows.length,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    refunded: 0,
    declined: 0,
    expired: 0,
  };
  for (const row of rows) {
    out[row.status]++;
  }
  return out;
}
