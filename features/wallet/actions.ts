'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { userProfileEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { resolveEditTargets } from '@/features/admin/users/queries';
import { creditWallet, debitWallet } from '@/features/wallet/ledger';
import { adjustWalletBalanceSchema, issueWalletCreditSchema } from '@/features/wallet/schemas';
import type { WalletActionState } from '@/features/wallet/types';

/**
 * Mirror every admin wallet movement into the User-360 audit trail
 * (2026-07-20 audit — issuance previously left no `user_profile_events`
 * row, so the only record was the ledger row's unverified actor id).
 * Best-effort: the ledger row above is the money truth; a failed audit
 * write is reported, never rolled back over.
 */
async function logWalletEvent(
  subject: { guestId: string | null; hostId: string | null; authUserId: string | null },
  actorUserId: string,
  field: 'wallet.credit_issued' | 'wallet.balance_deducted',
  detail: string,
): Promise<void> {
  try {
    await db.insert(userProfileEvents).values({
      subjectAuthUserId: subject.authUserId,
      subjectGuestId: subject.guestId,
      subjectHostId: subject.hostId,
      actorUserId,
      field,
      previousValue: null,
      newValue: detail,
    });
  } catch (error) {
    reportError(error, { surface: 'wallet:auditEvent', field });
  }
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: WalletActionState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

const ECHO_KEYS = ['amountSar', 'note', 'expiresAt'] as const;

function echoValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of ECHO_KEYS) values[key] = formValue(formData, key);
  return values;
}

function fieldFlags(issues: readonly { path: readonly PropertyKey[] }[]): Record<string, true> {
  const fields: Record<string, true> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string') fields[field] = true;
  }
  return fields;
}

function revalidateWallet(): void {
  revalidatePath('/[locale]/admin/users/[key]', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
}

export async function issueWalletCredit(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const key = formValue(formData, 'key');
  const parsed = issueWalletCreditSchema.safeParse({
    amountSar: formValue(formData, 'amountSar'),
    reason: formValue(formData, 'reason'),
    note: formValue(formData, 'note'),
    expiresAt: formValue(formData, 'expiresAt'),
    idempotencyKey: formValue(formData, 'idempotencyKey'),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: 'validation',
      fields: fieldFlags(parsed.error.issues),
      values: echoValues(formData),
    };
  }

  try {
    const targets = await resolveEditTargets(key);
    if (!targets?.guestId) return { success: false, message: 'not_found' };

    await creditWallet({
      guestId: targets.guestId,
      type: parsed.data.reason,
      amountSar: parsed.data.amountSar,
      actorUserId: guard.adminUserId,
      note: parsed.data.note ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    await logWalletEvent(
      targets,
      guard.adminUserId,
      'wallet.credit_issued',
      `+${parsed.data.amountSar} SAR (${parsed.data.reason})${parsed.data.note ? ` — ${parsed.data.note}` : ''}`,
    );
  } catch (error) {
    // The unique idempotency key already landed — the earlier submit won.
    if (isUniqueViolation(error)) {
      revalidateWallet();
      return { success: true };
    }
    reportError(error, { surface: 'wallet:issue', key });
    return { success: false, message: 'server', values: echoValues(formData) };
  }

  revalidateWallet();
  return { success: true };
}

export async function adjustWalletBalance(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const key = formValue(formData, 'key');
  const parsed = adjustWalletBalanceSchema.safeParse({
    amountSar: formValue(formData, 'amountSar'),
    note: formValue(formData, 'note'),
    idempotencyKey: formValue(formData, 'idempotencyKey'),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: 'validation',
      fields: fieldFlags(parsed.error.issues),
      values: echoValues(formData),
    };
  }

  try {
    const targets = await resolveEditTargets(key);
    if (!targets?.guestId) return { success: false, message: 'not_found' };

    const outcome = await debitWallet({
      guestId: targets.guestId,
      type: 'admin_adjustment',
      amountSar: parsed.data.amountSar,
      actorUserId: guard.adminUserId,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (outcome === 'insufficient_balance') {
      return { success: false, message: 'insufficient_balance', values: echoValues(formData) };
    }
    await logWalletEvent(
      targets,
      guard.adminUserId,
      'wallet.balance_deducted',
      `-${parsed.data.amountSar} SAR${parsed.data.note ? ` — ${parsed.data.note}` : ''}`,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      revalidateWallet();
      return { success: true };
    }
    reportError(error, { surface: 'wallet:adjust', key });
    return { success: false, message: 'server', values: echoValues(formData) };
  }

  revalidateWallet();
  return { success: true };
}
