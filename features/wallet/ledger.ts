import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
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
 * Remove credit (`input.amountSar` is the positive magnitude; the
 * stored row is negated). The balance may never go below zero: SUM
 * can't be row-locked, so two concurrent debits could both pass the
 * read — a per-guest advisory xact lock serializes them.
 */
export async function debitWallet(input: WalletEntryInput): Promise<'ok' | 'insufficient_balance'> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'wallet:' + input.guestId}))`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${walletLedger.amountSar}), 0)::int` })
      .from(walletLedger)
      .where(eq(walletLedger.guestId, input.guestId));
    if ((row?.balance ?? 0) < input.amountSar) return 'insufficient_balance';
    await tx.insert(walletLedger).values({ ...input, amountSar: -input.amountSar });
    return 'ok';
  });
}
