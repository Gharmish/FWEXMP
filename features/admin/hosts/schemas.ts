import { z } from 'zod';

const localeSchema = z.enum(['en', 'ar']);

/**
 * Reviewer notes on host status changes are internal context — never
 * shown to the host. Optional on both suspend and restore (we don't
 * want to gate the action on writing a note), but encouraged.
 */
const optionalNotes = z
  .union([z.string().trim().max(2000), z.literal('').transform(() => undefined)])
  .optional();

export const suspendHostSchema = z.object({
  hostId: z.string().uuid(),
  reviewerNotes: optionalNotes,
  locale: localeSchema,
});

export const unsuspendHostSchema = z.object({
  hostId: z.string().uuid(),
  reviewerNotes: optionalNotes,
  locale: localeSchema,
});

export type SuspendHostInput = z.infer<typeof suspendHostSchema>;
export type UnsuspendHostInput = z.infer<typeof unsuspendHostSchema>;
