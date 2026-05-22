import { z } from 'zod';

/**
 * Reviewer notes are optional on approve, required on reject — the
 * user-facing rejection surface needs a sentence the team can show.
 */
export const approveApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  reviewerNotes: z
    .union([z.string().trim().max(2000), z.literal('').transform(() => undefined)])
    .optional(),
  locale: z.enum(['en', 'ar']),
});

export const rejectApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  reviewerNotes: z.string().trim().min(10, 'rejection_note_short').max(2000),
  locale: z.enum(['en', 'ar']),
});

export type ApproveApplicationInput = z.infer<typeof approveApplicationSchema>;
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;
