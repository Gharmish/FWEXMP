import { z } from 'zod';
import { linesFromTextarea } from '@/features/host-experiences/schemas';

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

/**
 * Inline Arabic copy editor on the moderation detail page. Same bounds
 * as the full admin editor (`adminExperienceSchema`) so the two
 * surfaces can never disagree about what's valid Arabic copy.
 */
export const updateArabicCopySchema = z.object({
  experienceId: z.string().uuid(),
  titleAr: z.string().trim().min(2, 'title_ar_invalid').max(160, 'title_ar_invalid'),
  descriptionAr: z
    .string()
    .trim()
    .min(10, 'description_ar_invalid')
    .max(5000, 'description_ar_invalid'),
  // Lists + policy are optional Arabic: empty means "not written yet"
  // and the public site falls back to the seed dictionary / English.
  inclusionsArRaw: z.string().transform(linesFromTextarea),
  whatToBringArRaw: z.string().transform(linesFromTextarea),
  cancellationPolicyAr: z.string().trim().max(1000, 'policy_ar_invalid'),
  locale: localeSchema,
});

export type ApproveExperienceInput = z.infer<typeof approveExperienceSchema>;
export type RejectExperienceInput = z.infer<typeof rejectExperienceSchema>;
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;
