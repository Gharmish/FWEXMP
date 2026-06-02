import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone';

export const bookingRequestSchema = z.object({
  experienceSlug: z.string().min(1),
  locale: z.enum(['en', 'ar']),
  name: z.string().trim().min(2).max(80),
  // The form posts a canonical E.164 number (any country except Israel, see
  // `lib/phone`). Bare digits from API/MCP clients are read as Saudi numbers.
  phone: z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (!raw) {
        ctx.addIssue({ code: 'custom', message: 'required' });
        return z.NEVER;
      }
      const e164 = normalizeToE164(raw);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
        return z.NEVER;
      }
      return e164;
    }),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(20),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
