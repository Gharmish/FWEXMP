import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decryptPii } from '@/lib/pii-crypto';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import type { Booking } from '@/db/schema';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { bookingLinkTokenValid } from '@/features/bookings/lib/link-token';
import type { PolicySnapshot } from '@/features/bookings/lib/policy';
import { reportError } from '@/lib/log';

/**
 * Read-side for bookings — currently just a lookup by the
 * idempotencyKey we use as the public reference on the confirmation
 * page. Sample-data fallback returns undefined (we don't persist any
 * preview bookings in memory; the confirmation page renders generic
 * copy when this returns undefined).
 *
 * Once host dashboards land this grows getBookingsForGuest /
 * getBookingsForHost; for now we keep the surface small.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

export interface BookingDetail {
  id: string;
  /** Owning guest row — server-side only; used for wallet ownership checks. */
  guestId: string;
  reference: string;
  /** Short human reference (`GH-7K3M9X`) — what guests see and quote. */
  referenceCode: string;
  status: Booking['status'];
  paymentStatus: Booking['paymentStatus'];
  partySize: number;
  /** Amount actually charged (post-discount). Pre-discount = this + discountSar. */
  totalAmountSar: number;
  /** Whole-SAR promo discount applied; 0 when no code was redeemed. */
  discountSar: number;
  /** UPPERCASE promo code snapshotted at redemption; null when none. */
  promoCode: string | null;
  /**
   * Gharmish Credit redeemed against this booking, whole SAR; 0 when
   * none. Pre-credit amount = totalAmountSar + walletAppliedSar.
   */
  walletAppliedSar: number;
  /** Commission rate snapshotted at booking time, basis points. */
  commissionBps: number;
  /**
   * VAT rate snapshotted at payment settlement, basis points. Null =
   * the payment settled with the platform VAT toggle off (or is unpaid).
   */
  vatRateBps: number | null;
  /** Seller VAT registration number snapshotted with the rate. */
  vatRegistrationNumber: string | null;
  /**
   * Invoice line-item description (experience title) + buyer name,
   * snapshotted at settlement. Null on rows settled before the columns
   * existed — the invoice page falls back to live lookups there.
   */
  invoiceItemEn: string | null;
  invoiceItemAr: string | null;
  billedName: string | null;
  date: string;
  startTime: string;
  experienceSlug: string;
  /** Guest's name — used to prefill the payment-details step. */
  guestName: string;
  /** Guest's email if known — prefills the payment-details step. */
  guestEmail: string | null;
  /** Guest's E.164 phone if known — the WhatsApp notification address. */
  guestPhone: string | null;
  /** Guest's preferred locale — decision emails are sent in it. */
  guestPreferredLanguage: 'en' | 'ar';
  /**
   * Consent evidence stamped by the booking form (2026-08-02 legal
   * audit): when the guest accepted the Terms/Privacy/Cancellation
   * clickwrap and which document version. The pay step reads these to
   * decide whether it may carry that acceptance over instead of asking
   * for a second tick (`termsCarriedOver`, features/payments/lib/terms).
   * Null on rows that predate the columns.
   */
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  /**
   * Money-state markers the confirmation page needs before it may offer
   * payment on a `processing` row: a settle anomaly (a real capture is
   * sitting unmatched — never invite a second payment) and a superseded
   * checkout (the id on the row can no longer be paid). ISO or null.
   */
  settleAnomalyAt: string | null;
  checkoutSupersededAt: string | null;
  /** Card scheme once settled (e.g. `MADA`, `VISA`, `MASTER`); null otherwise. */
  paymentBrand: string | null;
  /** When payment settled, ISO string; null until paid. */
  paidAt: string | null;
  /** Request-to-book: when the host's decision window closes. ISO; null for instant. */
  approvalDeadline: string | null;
  /** When the host/admin approved the request. ISO; null otherwise. */
  approvedAt: string | null;
  /** When an unpaid hold (instant, or approved request) lapses. ISO; null when none. */
  paymentDeadline: string | null;
  /** When the booking was moved to `refunded`. ISO; null when never refunded. */
  refundedAt: string | null;
  /**
   * Whole-SAR actually returned to the guest (card + credit legs).
   * Null on rows refunded before the column shipped — the invoice page
   * falls back to the full total there (those refunds WERE full).
   */
  refundedAmountSar: number | null;
  /** How the refund travelled (`wallet` = credited to Gharmish Credit). Null = never refunded. */
  refundMethod: Booking['refundMethod'];
  /** Whole SAR still owed to the guest via the manual (bank-transfer) queue. Null = nothing queued. */
  refundDueSar: number | null;
  /**
   * Payee details the guest gave for a manual bank-transfer refund.
   * Null until submitted. The IBAN is MASKED at the query layer
   * (`SA44 •••• … ••34`) — this shape reaches viewers who hold only the
   * read-only booking link, and a forwarded link must never leak the
   * full account (2026-08-28 audit). Changing it requires full re-entry;
   * the real value stays encrypted server-side (admin queries decrypt
   * their own copy).
   */
  refundBank: {
    bankName: string;
    beneficiaryName: string;
    ibanMasked: string;
    submittedAt: string;
  } | null;
  /** Who called the booking off (`emergency` = admin force-majeure flow). Null = not cancelled. */
  cancellationKind: Booking['cancellationKind'];
  /**
   * Cancellation-policy snapshot taken at booking creation — feeds
   * `bookingOptions()`, which decides the cancel/reschedule actions a
   * page may render for this booking.
   */
  policy: PolicySnapshot;
  /** Self-service reschedules already used (`MAX_RESCHEDULES` caps this). */
  rescheduleCount: number;
  /** Pre-move date if the booking was rescheduled later; anchors refunds. */
  rescheduledFromDate: string | null;
  createdAt: string;
}

/**
 * Mask an IBAN for guest-facing display: keep the SA-prefixed head (4)
 * and the last two characters, dot the middle, grouped in fours the way
 * bank apps print it.
 */
function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  const masked =
    compact.length > 6
      ? `${compact.slice(0, 4)}${'•'.repeat(compact.length - 6)}${compact.slice(-2)}`
      : compact;
  return masked.replace(/(.{4})/g, '$1 ').trim();
}

/** The manual-refund payee block (IBAN masked); null until all three are on file. */
function refundBankOf(row: {
  refundBankName: string | null;
  refundBeneficiaryName: string | null;
  refundIban: string | null;
  refundBankDetailsAt: Date | null;
}): BookingDetail['refundBank'] {
  const iban = decryptPii(row.refundIban);
  if (!row.refundBankName || !row.refundBeneficiaryName || !iban) return null;
  return {
    bankName: row.refundBankName,
    beneficiaryName: row.refundBeneficiaryName,
    ibanMasked: maskIban(iban),
    submittedAt: (row.refundBankDetailsAt ?? new Date(0)).toISOString(),
  };
}

/** The snapshot columns, shaped for `bookingOptions()`. */
function policyOf(row: {
  policyTier: PolicySnapshot['policyTier'];
  freeCancelHours: number;
  partialRefundHours: number;
  partialRefundBps: number;
  rescheduleCutoffHours: number;
}): PolicySnapshot {
  return {
    policyTier: row.policyTier,
    freeCancelHours: row.freeCancelHours,
    partialRefundHours: row.partialRefundHours,
    partialRefundBps: row.partialRefundBps,
    rescheduleCutoffHours: row.rescheduleCutoffHours,
  };
}

export async function getBookingByReference(reference: string): Promise<BookingDetail | undefined> {
  if (!hasDb()) return undefined;
  // Deadline-bounded: this renders the post-payment confirmation page —
  // production showed 300s hangs here when the pooled connection was
  // poisoned. A persistent failure now throws (bounded) to the route's
  // error boundary instead of stalling a guest who has just paid.
  const row = await boundedQuery('bookings:byReference', () =>
    db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      with: {
        experience: { columns: { slug: true } },
        guest: { columns: { name: true, email: true, phone: true, preferredLanguage: true } },
      },
    }),
  );
  if (!row) return undefined;
  return {
    id: row.id,
    guestId: row.guestId,
    reference: row.idempotencyKey,
    referenceCode: row.referenceCode,
    status: row.status,
    paymentStatus: row.paymentStatus,
    partySize: row.partySize,
    totalAmountSar: row.totalAmount,
    discountSar: row.discountSar,
    promoCode: row.promoCode,
    walletAppliedSar: row.walletAppliedSar,
    commissionBps: row.commissionBps,
    vatRateBps: row.vatRateBps,
    vatRegistrationNumber: row.vatRegistrationNumber,
    invoiceItemEn: row.invoiceItemEn,
    invoiceItemAr: row.invoiceItemAr,
    billedName: row.billedName,
    date: row.date,
    startTime: row.startTime,
    experienceSlug: row.experience.slug,
    guestName: row.guest.name,
    guestEmail: row.guest.email,
    guestPhone: row.contactPhone ?? row.guest.phone,
    guestPreferredLanguage: row.guest.preferredLanguage,
    termsAcceptedAt: row.termsAcceptedAt?.toISOString() ?? null,
    termsVersion: row.termsVersion,
    settleAnomalyAt: row.settleAnomalyAt?.toISOString() ?? null,
    checkoutSupersededAt: row.checkoutSupersededAt?.toISOString() ?? null,
    paymentBrand: row.paymentBrand,
    paidAt: row.paidAt?.toISOString() ?? null,
    approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paymentDeadline: row.paymentDeadline?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    refundedAmountSar: row.refundedAmountSar,
    refundMethod: row.refundMethod,
    refundDueSar: row.refundDueSar,
    refundBank: refundBankOf(row),
    cancellationKind: row.cancellationKind,
    policy: policyOf(row),
    rescheduleCount: row.rescheduleCount,
    rescheduledFromDate: row.rescheduledFromDate,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Why a viewer is (or isn't) seeing a booking.
 *
 * The three "no booking" reasons are NOT interchangeable and pages must
 * not collapse them (2026-08-08): a preview environment with no database
 * is a developer state, an unknown reference is a broken link, and
 * "exists but this viewer isn't authorized" is the ordinary, expected
 * outcome for a real guest — the anonymous booking flow authorizes on a
 * per-browser cookie, so opening the emailed link on a second device,
 * after clearing cookies, or after a newer booking overwrote the cookie
 * all land here. Telling that guest their booking "was not stored" is a
 * lie about a real (often paid) booking.
 */
export type BookingViewerResult =
  | {
      state: 'ok';
      booking: BookingDetail;
      /**
       * Which proof admitted this viewer. `owner` (signed-in account)
       * and `cookie` (the booking's own browser) both satisfy the
       * mutating actions' `bookingViewerCanAccess`; `token` is the
       * READ-ONLY signed link — pages must not render cancel /
       * reschedule / review / dispute forms for it (every one would
       * fail server-side with a misleading error).
       */
      proof: 'owner' | 'cookie' | 'token';
    }
  /** No DATABASE_URL — genuine preview/no-DB environment. */
  | { state: 'no_db' }
  /** No row carries this reference. */
  | { state: 'not_found' }
  /** The row exists; this viewer has neither proof of ownership. */
  | { state: 'forbidden' };

/**
 * Like {@link getBookingByReference}, but authorizes the *viewer* first
 * and reports WHY when it withholds the booking (see
 * {@link BookingViewerResult}). The caller must own the booking, hold it
 * in their last-booking cookie (see {@link bookingViewerCanAccess}), or
 * present the signed `token` from a link we sent them (see
 * {@link bookingLinkTokenValid}) — the reference alone never suffices,
 * and no detail (no PII) is returned in any other state.
 *
 * The token authorizes READS only. It is deliberately not plumbed into
 * `bookingViewerCanAccess`, so cancel, reschedule, refund and review
 * still demand the cookie or a signed-in account (2026-08-09).
 */
/*
 * React `cache()`-wrapped: the confirmation page resolves the same
 * reference in `generateMetadata` (the tab title differs when access is
 * withheld) and again in the render. Scope is one request, so a second
 * viewer never sees the first one's answer. The token is part of the
 * cache key, so a tokenless read never reuses a tokened answer.
 */
export const getBookingViewForViewer = cache(
  async (reference: string, token?: string | null): Promise<BookingViewerResult> => {
    if (!hasDb()) return { state: 'no_db' };
    const owner = await boundedQuery('bookings:viewerLookup', () =>
      db.query.bookings.findFirst({
        where: eq(bookings.idempotencyKey, reference),
        columns: { guestId: true },
      }),
    );
    if (!owner) return { state: 'not_found' };
    // The full (mutating-grade) proof is checked FIRST so a viewer who
    // holds both the cookie/session and the link token is never
    // downgraded to the read-only `token` proof.
    const trusted = await bookingViewerCanAccess(reference, owner.guestId);
    let proof: 'owner' | 'cookie' | 'token';
    if (trusted) {
      // Which of the two full proofs: the last-booking cookie naming
      // this reference, otherwise it was the signed-in owner check.
      const store = await cookies();
      const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
      proof = hint?.reference === reference ? 'cookie' : 'owner';
    } else if (bookingLinkTokenValid(reference, token)) {
      proof = 'token';
    } else {
      return { state: 'forbidden' };
    }
    const booking = await getBookingByReference(reference);
    // Vanished between the two reads (deleted mid-render) — same as unknown.
    return booking ? { state: 'ok', booking, proof } : { state: 'not_found' };
  },
);

/**
 * {@link getBookingViewForViewer} for callers that only need the booking
 * and treat every withheld state the same (route handlers, the pay page).
 * Pages whose *copy* differs per state must use the discriminated form.
 */
export async function getBookingByReferenceForViewer(
  reference: string,
  token?: string | null,
): Promise<BookingDetail | undefined> {
  const view = await getBookingViewForViewer(reference, token);
  return view.state === 'ok' ? view.booking : undefined;
}

/** A booking as the profile history list renders it — carries the bilingual experience title. */
export interface GuestBookingSummary extends BookingDetail {
  experienceTitleEn: string;
  experienceTitleAr: string;
}

/**
 * Hard cap on the profile booking-history list. Nobody scrolls hundreds
 * of bookings on /me; without a LIMIT a heavy repeat guest hydrates an
 * unbounded row set into the page render.
 */
const GUEST_BOOKINGS_LIMIT = 100;

/**
 * A guest's bookings, newest first (capped at {@link GUEST_BOOKINGS_LIMIT}).
 * Drives the booking-history section on the profile page; empty when
 * the DB isn't configured. Bounded: /me must degrade to an empty list
 * on a hung pooled connection, not stall the whole account page.
 */
export async function getBookingsForGuest(guestId: string): Promise<GuestBookingSummary[]> {
  if (!hasDb()) return [];
  let rows;
  try {
    rows = await boundedQuery('bookings:forGuest', () =>
      db.query.bookings.findMany({
        where: eq(bookings.guestId, guestId),
        orderBy: [desc(bookings.date), desc(bookings.createdAt)],
        limit: GUEST_BOOKINGS_LIMIT,
        with: {
          experience: { columns: { slug: true, titleEn: true, titleAr: true } },
          guest: { columns: { name: true, email: true, phone: true, preferredLanguage: true } },
        },
      }),
    );
  } catch (error) {
    reportError(error, { surface: 'bookings:getBookingsForGuest', guestId });
    return [];
  }
  return rows.map((row) => ({
    id: row.id,
    guestId: row.guestId,
    reference: row.idempotencyKey,
    referenceCode: row.referenceCode,
    status: row.status,
    paymentStatus: row.paymentStatus,
    partySize: row.partySize,
    totalAmountSar: row.totalAmount,
    discountSar: row.discountSar,
    promoCode: row.promoCode,
    walletAppliedSar: row.walletAppliedSar,
    commissionBps: row.commissionBps,
    vatRateBps: row.vatRateBps,
    vatRegistrationNumber: row.vatRegistrationNumber,
    invoiceItemEn: row.invoiceItemEn,
    invoiceItemAr: row.invoiceItemAr,
    billedName: row.billedName,
    date: row.date,
    startTime: row.startTime,
    experienceSlug: row.experience.slug,
    guestName: row.guest.name,
    guestEmail: row.guest.email,
    guestPhone: row.contactPhone ?? row.guest.phone,
    guestPreferredLanguage: row.guest.preferredLanguage,
    termsAcceptedAt: row.termsAcceptedAt?.toISOString() ?? null,
    termsVersion: row.termsVersion,
    settleAnomalyAt: row.settleAnomalyAt?.toISOString() ?? null,
    checkoutSupersededAt: row.checkoutSupersededAt?.toISOString() ?? null,
    paymentBrand: row.paymentBrand,
    paidAt: row.paidAt?.toISOString() ?? null,
    approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paymentDeadline: row.paymentDeadline?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    refundedAmountSar: row.refundedAmountSar,
    refundMethod: row.refundMethod,
    refundDueSar: row.refundDueSar,
    refundBank: refundBankOf(row),
    cancellationKind: row.cancellationKind,
    policy: policyOf(row),
    rescheduleCount: row.rescheduleCount,
    rescheduledFromDate: row.rescheduledFromDate,
    experienceTitleEn: row.experience.titleEn,
    experienceTitleAr: row.experience.titleAr,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The host's WhatsApp-able contact phone for a booking — only for
 * bookings the host has accepted (confirmed/completed): a declined or
 * pending request must not leak the host's personal number. Canonical
 * source is `hosts.contact_phone` (copied from the application at
 * approval); the approved application is kept as a fallback for any
 * pre-column host the backfill missed. Seeded demo hosts have neither
 * and yield null.
 */
export async function getHostContactPhoneForBooking(reference: string): Promise<string | null> {
  if (!hasDb()) return null;
  try {
    const row = await boundedQuery('bookings:hostContact:booking', () =>
      db.query.bookings.findFirst({
        where: eq(bookings.idempotencyKey, reference),
        columns: { status: true },
        with: {
          experience: {
            columns: { hostId: true },
            with: { host: { columns: { contactPhone: true } } },
          },
        },
      }),
    );
    if (!row || (row.status !== 'confirmed' && row.status !== 'completed')) return null;
    if (row.experience.host.contactPhone) return row.experience.host.contactPhone;
    const application = await boundedQuery('bookings:hostContact:application', () =>
      db.query.hostApplications.findFirst({
        where: (a) => eq(a.hostId, row.experience.hostId),
        columns: { contactPhone: true },
      }),
    );
    return application?.contactPhone ?? null;
  } catch (error) {
    reportError(error, { surface: 'bookings:getHostContact', reference });
    return null;
  }
}

/**
 * Completed bookings for an experience — feeds the "{n}+ booked" social
 * proof chip (shown only at ≥10, owner-approved threshold 2026-06-11).
 * Never throws; 0 on no-DB/error keeps public pages resilient
 * (memory: home-page-db-resilience).
 */
export async function getCompletedBookingsCountForExperience(slug: string): Promise<number> {
  if (!hasDb()) return 0;
  try {
    const [row] = await boundedQuery('bookings:completedCount', () =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .where(and(eq(experiences.slug, slug), eq(bookings.status, 'completed'))),
    );
    return row?.count ?? 0;
  } catch (error) {
    reportError(error, { surface: 'bookings:completedCount', slug });
    return 0;
  }
}
