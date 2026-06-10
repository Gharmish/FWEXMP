import { z } from 'zod';

/**
 * Guest "report a problem" + admin resolution. The booking reference
 * is the guest-held capability (same model as reviews/cancellation);
 * the action separately verifies the caller may act on it.
 */
export const DISPUTE_MESSAGE_MAX = 2000;

export const createDisputeSchema = z.object({
  reference: z.string().uuid(),
  message: z.string().trim().min(10).max(DISPUTE_MESSAGE_MAX),
  locale: z.enum(['en', 'ar']),
});

export const resolveDisputeSchema = z.object({
  disputeId: z.string().uuid(),
  adminNotes: z.string().trim().max(DISPUTE_MESSAGE_MAX).optional(),
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
