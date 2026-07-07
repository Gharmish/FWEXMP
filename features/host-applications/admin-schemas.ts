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

/**
 * Per-document verdicts. Same note rule as the application decision:
 * a rejection must tell the host what to re-upload and why.
 */
export const reviewDocumentSchema = z
  .object({
    documentId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected']),
    reviewerNotes: z
      .union([z.string().trim().max(2000), z.literal('').transform(() => undefined)])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'rejected' && (data.reviewerNotes ?? '').length < 10) {
      ctx.addIssue({ code: 'custom', path: ['reviewerNotes'], message: 'rejection_note_short' });
    }
  });

export type ApproveApplicationInput = z.infer<typeof approveApplicationSchema>;
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
