import { z } from 'zod';

/**
 * Admin moderation actions. Notes are optional on approve, required
 * (min 10 chars) on reject and request-changes — the host needs to
 * know what to fix in both cases.
 */
const localeSchema = z.enum(['en', 'ar']);

export const approveExperienceSchema = z.object({
  experienceId: z.string().uuid(),
  reviewerNotes: z
    .union([z.string().trim().max(2000), z.literal('').transform(() => undefined)])
    .optional(),
  locale: localeSchema,
});

export const rejectExperienceSchema = z.object({
  experienceId: z.string().uuid(),
  reviewerNotes: z.string().trim().min(10, 'reviewer_note_short').max(2000),
  locale: localeSchema,
});

export const requestChangesSchema = z.object({
  experienceId: z.string().uuid(),
  reviewerNotes: z.string().trim().min(10, 'reviewer_note_short').max(2000),
  locale: localeSchema,
});

export type ApproveExperienceInput = z.infer<typeof approveExperienceSchema>;
export type RejectExperienceInput = z.infer<typeof rejectExperienceSchema>;
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;
