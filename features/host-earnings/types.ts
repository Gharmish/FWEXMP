/**
 * Types for the host-earnings feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface HostEarningsHistoryRow {
  id: string;
  date: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  partySize: number;
  /** What the guest paid (VAT-inclusive gross). */
  totalSar: number;
  /**
   * VAT portion contained in the gross (per-booking settlement snapshot).
   * 0 for bookings settled before the platform registered for VAT.
   */
  vatSar: number;
  /**
   * The platform's NET deduction as seen from the host's side:
   * `totalSar − vatSar − payoutSar`, so every statement row sums back
   * to what the guest was charged. NOT the commission rate applied to a
   * base (2026-08-01 ninth audit — the old doc said "on the ex-VAT
   * net", which is `splitCommission`'s definition and differs on every
   * promo/credit booking): the payout base adds platform-funded
   * discounts and redeemed credit back, so this figure is commission
   * MINUS that funding and goes negative when the funding exceeds the
   * commission. Deliberate presentation — the host statement shows the
   * guest's money, not the platform's marketing spend.
   */
  commissionSar: number;
  /** Commission rate applied (snapshot), basis points. */
  commissionBps: number;
  payoutSar: number;
  /** Null = completed but not yet paid out. */
  paidOutAt: string | null;
}

export interface HostEarningsTotals {
  owedSar: number;
  owedCount: number;
  paidSar: number;
  paidCount: number;
  upcomingSar: number;
  upcomingCount: number;
}

/** One experience's completed-earnings rollup within the active range. */
export interface HostEarningsBreakdownRow {
  experienceId: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  count: number;
  payoutSar: number;
}

/** One calendar month's completed-earnings rollup within the active range. */
export interface HostEarningsMonthlyRow {
  /** `YYYY-MM`. */
  month: string;
  count: number;
  payoutSar: number;
}

/** One recorded payout batch — the header of a remittance statement. */
export interface HostPayoutBatch {
  id: string;
  /** ISO instant the admin recorded the transfer. */
  createdAt: string;
  amountSar: number;
  bookingCount: number;
}

/** A payout batch plus its per-booking money breakdown. */
export interface HostPayoutStatement extends HostPayoutBatch {
  /** IBAN the batch was sent to (as recorded), null for legacy rows. */
  payoutIban: string | null;
  bankReference: string | null;
  rows: readonly HostPayoutStatementRow[];
  /**
   * Clawback deductions absorbed by THIS batch (refunds issued after an
   * earlier payout). `amountSar` above is already net of these.
   */
  deductions: readonly HostPayoutDeductionRow[];
}

export interface HostPayoutDeductionRow {
  /** Reference code of the refunded booking the deduction reverses. */
  referenceCode: string;
  amountSar: number;
}

export interface HostPayoutStatementRow {
  referenceCode: string;
  date: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
  partySize: number;
  totalSar: number;
  vatSar: number;
  commissionSar: number;
  commissionBps: number;
  payoutSar: number;
}

/** Booking-date bounds (inclusive, `YYYY-MM-DD`) for the ledger + rollups. */
export interface HostEarningsRange {
  from?: string;
  to?: string;
}

/** Which bookings the ledger lists: earned (completed) or projected (confirmed, ahead). */
export type HostLedgerScope = 'completed' | 'upcoming';

export interface HostEarnings extends HostEarningsTotals {
  payoutIban: string | null;
  /** One page of the ledger, newest-first, in the active scope. */
  history: readonly HostEarningsHistoryRow[];
  /** Ledger rows in the active scope + range (all pages). */
  historyTotal: number;
  historyPage: number;
  historyScope: HostLedgerScope;
  /** Completed earnings per experience, biggest payout first. */
  breakdown: readonly HostEarningsBreakdownRow[];
  /** Completed earnings per month, newest first (12-month window). */
  monthly: readonly HostEarningsMonthlyRow[];
}
