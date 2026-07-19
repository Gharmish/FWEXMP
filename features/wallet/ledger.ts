import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { walletLedger, type NewWalletLedgerEntry, type WalletLedgerEntry } from '@/db/schema';

/**
 * Append-only Gharmish Credit ledger access. Rows are never updated or
 * deleted; the balance is always SUM(amount_sar) for the guest, and
 * each row doubles as the audit record for the movement it describes.
 *
 * `creditWallet` and `debitWallet` THROW on failure (except the debit's
 * insufficient-balance outcome, which is a value) — callers own the
 * catch path and the user-facing failure shape.
 */

export type WalletEntryInput = Pick<
  NewWalletLedgerEntry,
  | 'guestId'
  | 'type'
  | 'amountSar'
  | 'actorUserId'
  | 'note'
  | 'expiresAt'
  | 'bookingId'
  | 'disputeId'
  | 'idempotencyKey'
>;

/**
 * Whether a ledger row with this idempotency key exists — the
 * self-verifying check money flows use before assuming a movement
 * happened (e.g. "was this booking's redemption actually debited?").
 */
export async function hasWalletEntry(idempotencyKey: string): Promise<boolean> {
  const row = await db.query.walletLedger.findFirst({
    where: eq(walletLedger.idempotencyKey, idempotencyKey),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Whether any redemption row exists for a booking — the proof its
 * wallet application actually debited the ledger. Keyed by booking id,
 * not idempotency key: apply/remove cycles suffix their keys
 * (`redeem:<bookingId>:<n>`), so no single key is authoritative.
 */
export async function hasRedemptionForBooking(bookingId: string): Promise<boolean> {
  const row = await db.query.walletLedger.findFirst({
    where: and(eq(walletLedger.bookingId, bookingId), eq(walletLedger.type, 'redemption')),
    columns: { id: true },
  });
  return Boolean(row);
}

/** Current balance in whole SAR. */
export async function getWalletBalanceSar(guestId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int` })
    .from(walletLedger)
    .where(eq(walletLedger.guestId, guestId));
  return row?.balance ?? 0;
}

/** Full credit history for a guest, newest first. */
export async function listWalletEntries(guestId: string): Promise<readonly WalletLedgerEntry[]> {
  return db.query.walletLedger.findMany({
    where: eq(walletLedger.guestId, guestId),
    orderBy: desc(walletLedger.createdAt),
  });
}

/** Add credit. A positive entry can never take the balance negative, so no transaction. */
export async function creditWallet(input: WalletEntryInput): Promise<void> {
  await db.insert(walletLedger).values(input);
}

/**
 * `creditWallet` inside a caller-owned transaction — the credit commits
 * or rolls back with the caller's writes (e.g. a reservation release
 * restores the booking total in the same transaction that returns the
 * credit). No advisory lock: positive entries can't overdraw.
 */
export async function creditWalletTx(tx: WalletTx, input: WalletEntryInput): Promise<void> {
  await tx.insert(walletLedger).values(input);
}

/**
 * Remove credit (`input.amountSar` is the positive magnitude; the
 * stored row is negated). The balance may never go below zero: SUM
 * can't be row-locked, so two concurrent debits could both pass the
 * read — a per-guest advisory xact lock serializes them.
 */
export async function debitWallet(input: WalletEntryInput): Promise<'ok' | 'insufficient_balance'> {
  return db.transaction(async (tx) => debitWalletTx(tx, input));
}

/** The transaction handle `db.transaction` hands its callback. */
export type WalletTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * `debitWallet` inside a caller-owned transaction, so the debit commits
 * or rolls back atomically with the caller's own writes (e.g. the
 * wallet-only settlement flips the booking to paid in the same
 * transaction that spends the credit). Same advisory-lock discipline —
 * the lock is xact-scoped, so it releases with the caller's commit.
 */
export async function debitWalletTx(
  tx: WalletTx,
  input: WalletEntryInput,
): Promise<'ok' | 'insufficient_balance'> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'wallet:' + input.guestId}))`);
  const [row] = await tx
    .select({ balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int` })
    .from(walletLedger)
    .where(eq(walletLedger.guestId, input.guestId));
  if ((row?.balance ?? 0) < input.amountSar) return 'insufficient_balance';
  await tx.insert(walletLedger).values({ ...input, amountSar: -input.amountSar });
  return 'ok';
}
