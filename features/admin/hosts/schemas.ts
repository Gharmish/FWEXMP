import { z } from 'zod';

const localeSchema = z.enum(['en', 'ar']);

export const suspendHostSchema = z.object({
  hostId: z.string().uuid(),
  locale: localeSchema,
});

export const unsuspendHostSchema = z.object({
  hostId: z.string().uuid(),
  locale: localeSchema,
});

export type SuspendHostInput = z.infer<typeof suspendHostSchema>;
export type UnsuspendHostInput = z.infer<typeof unsuspendHostSchema>;
