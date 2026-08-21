import 'server-only';

import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { encryptPii } from '@/lib/pii-crypto';
import type { RefundBankDetailsInput } from '@/features/bookings/schemas';

/**
 * Stamp the payee for a manual bank-transfer refund onto a booking whose
 * money is still owed (a queued `refundDueSar`, or a paid booking that
 * was cancelled and not yet refunded). Shared by the booking-page server
 * action and the WhatsApp support agent — authorization is the caller's
 * job (this runs on a booking id the caller already proved ownership
 * of). Returns false when nothing is owed any more (details are frozen
 * once the transfer was recorded).
 */
export async function saveRefundBankDetails(
  bookingId: string,
  details: RefundBankDetailsInput,
): Promise<boolean> {
  const updated = await db
    .update(bookings)
    .set({
      refundBankName: details.bankName,
      refundIban: encryptPii(details.iban),
      refundBeneficiaryName: details.beneficiaryName,
      refundBankDetailsAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        or(
          isNotNull(bookings.refundDueSar),
          and(
            inArray(bookings.status, ['cancelled']),
            eq(bookings.paymentStatus, 'paid'),
            isNull(bookings.refundedAt),
          ),
        ),
      ),
    )
    .returning({ id: bookings.id });
  return updated.length > 0;
}
