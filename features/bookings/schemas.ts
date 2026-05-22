import { z } from 'zod';

export const bookingRequestSchema = z.object({
  experienceSlug: z.string().min(1),
  locale: z.enum(['en', 'ar']),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?9665\d{8}|05\d{8}|5\d{8})$/),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(20),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
