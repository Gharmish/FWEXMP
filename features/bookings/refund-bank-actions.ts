'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import {
  submitRefundBankDetailsSchema,
  type RefundBankDetailsInput,
} from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { saveRefundBankDetails } from '@/features/bookings/lib/refund-bank-core';

/**
 * Guest submits (or corrects) the payee details for a refund the admin
 * will wire by bank transfer (owner decision 2026-08-21). Covers every
 * refund that did NOT come through the guest's own cancel form — host /
 * admin / emergency cancellations, dispute resolutions, the WhatsApp
 * agent — which all queue `refundDueSar` with no payee on file.
 *
 * Editable while the money is still owed: a cancelled-and-paid booking
 * or any booking with a manual-queue entry. Once `refunded` with
 * nothing outstanding the details are frozen (the transfer used them).
 * Authorization requires cookie/session ownership ({@link
 * bookingViewerCanAccess}) — NOT the forwardable link token. This action
 * directs the refund OUT to a bank account, so admitting the token (as
 * checkout does for money coming IN) would let a leaked link redirect a
 * victim's refund. A cookieless token-only viewer is shown a sign-in
 * prompt on the booking page instead of this form.
 */

export type RefundBankDetailsState =
  | { success: true }
  | {
      success: false;
      message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'validation' | 'server';
      fields?: Partial<Record<keyof RefundBankDetailsInput, string>>;
      values?: Partial<Record<keyof RefundBankDetailsInput, string>>;
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitRefundBankDetails(
  _previous: RefundBankDetailsState,
  formData: FormData,
): Promise<RefundBankDetailsState> {
  const values = {
    bankName: formValue(formData, 'bankName'),
    beneficiaryName: formValue(formData, 'beneficiaryName'),
    iban: formValue(formData, 'iban'),
  };
  const parsed = submitRefundBankDetailsSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
    ...values,
  });
  if (!parsed.success) {
    const fields: Partial<Record<keyof RefundBankDetailsInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'bankName' || key === 'beneficiaryName' || key === 'iban') {
        fields[key] = issue.message;
      }
    }
    return { success: false, message: 'validation', fields, values };
  }
  const { reference, bankName, beneficiaryName, iban } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, guestId: true },
    });
    if (!booking) return { success: false, message: 'not_found' };
    // Cookie/session ONLY — never the link token. This records where a
    // manually-wired refund is SENT, so a forwardable ?k= link must not
    // authorize it (unlike checkout, which only pushes money IN). A
    // token-only viewer is shown a sign-in prompt on the page instead.
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Same shape as a missing booking — the reference can't be probed.
      return { success: false, message: 'not_found' };
    }

    const saved = await saveRefundBankDetails(booking.id, { bankName, beneficiaryName, iban });
    if (!saved) return { success: false, message: 'wrong_state' };
  } catch (error) {
    reportError(error, { surface: 'bookings:refundBankDetails', reference });
    return { success: false, message: 'server', values };
  }

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/bookings/[id]', 'page');
  return { success: true };
}
