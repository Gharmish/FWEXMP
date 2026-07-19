import type { WalletLedgerEntry } from '@/db/schema';

/**
 * Failure/success shape for the wallet admin actions, mirroring the
 * disputes convention: success is bare, every failure carries a typed
 * message the client maps to copy, plus optional per-field flags and
 * echoed values (React 19 resets uncontrolled inputs on action).
 */
export type WalletActionState =
  | { success: true }
  | {
      success: false;
      message?:
        | 'forbidden'
        | 'no_db'
        | 'not_found'
        | 'validation'
        | 'insufficient_balance'
        | 'server';
      fields?: Record<string, true>;
      values?: Record<string, string>;
    };

export interface WalletEntryView {
  id: string;
  type: WalletLedgerEntry['type'];
  /** Signed whole SAR as stored: positive credit, negative debit. */
  amountSar: number;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface WalletAdminView {
  balanceSar: number;
  entries: readonly WalletEntryView[];
}
