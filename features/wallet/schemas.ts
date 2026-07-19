import { z } from 'zod';

/** Cap on a single admin issue/adjust action, whole SAR. */
export const WALLET_MAX_PER_ACTION_SAR = 500;
export const WALLET_NOTE_MAX = 500;

/**
 * Optional `datetime-local` bound from the form (`YYYY-MM-DDTHH:MM`) or
 * empty. Kept as a string here; the action converts to a Date. An empty
 * string means "no expiry".
 */
const optionalLocalDateTime = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(new Date(v).getTime()), 'expiry_invalid')
  .optional();

const noteSchema = z
  .string()
  .trim()
  .max(WALLET_NOTE_MAX, 'note_long')
  .optional()
  .transform((v) => (v ? v : undefined));

export const issueWalletCreditSchema = z
  .object({
    amountSar: z.coerce
      .number()
      .int('amount_invalid')
      .positive('amount_invalid')
      .max(WALLET_MAX_PER_ACTION_SAR, 'amount_over_cap'),
    // P0 issues goodwill only; widening this enum is the whole change later.
    reason: z.enum(['goodwill']),
    note: noteSchema,
    expiresAt: optionalLocalDateTime,
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    if (data.expiresAt && data.expiresAt !== '') {
      if (new Date(data.expiresAt).getTime() <= Date.now()) {
        ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiry_past' });
      }
    }
  });

export type IssueWalletCreditInput = z.infer<typeof issueWalletCreditSchema>;

export const adjustWalletBalanceSchema = z.object({
  /** Positive magnitude typed by the admin; the ledger stores the negation. */
  amountSar: z.coerce
    .number()
    .int('amount_invalid')
    .positive('amount_invalid')
    .max(WALLET_MAX_PER_ACTION_SAR, 'amount_over_cap'),
  /** A deduction always carries a reason — the ledger row is the audit record. */
  note: z.string().trim().min(1, 'note_required').max(WALLET_NOTE_MAX, 'note_long'),
  idempotencyKey: z.string().uuid(),
});

export type AdjustWalletBalanceInput = z.infer<typeof adjustWalletBalanceSchema>;
