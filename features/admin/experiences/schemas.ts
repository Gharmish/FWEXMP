import { z } from 'zod';
import { hostExperienceInputSchema } from '@/features/host-experiences/schemas';

/**
 * Admin experience editor schema. Admins can change *everything* a host
 * can, plus the fields the host UI deliberately withholds: Arabic copy,
 * status, featured (Originals) flag, booking mode, daily start time,
 * blackout dates, and the platform commission.
 *
 * Built by extending the host schema so the shared fields (and their
 * textarea→array / weekday transforms) stay defined in one place.
 */

export const EXPERIENCE_STATUSES = [
  'draft',
  'pending_review',
  'changes_requested',
  'live',
  'paused',
  'archived',
] as const;

export const BOOKING_MODES = ['request', 'instant'] as const;

/** HH:MM 24-hour. */
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const datesFromTextarea = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

export const adminExperienceSchema = hostExperienceInputSchema.extend({
  // Arabic copy — admins may author/correct it directly (the no-AI-Arabic
  // rule is about the assistant, not the human operator).
  titleAr: z.string().trim().min(2, 'title_ar_short').max(160, 'title_ar_long'),
  descriptionAr: z.string().trim().min(10, 'description_ar_short').max(5000, 'description_ar_long'),
  startTime: z.string().regex(HHMM_RE, 'start_time_invalid'),
  bookingMode: z.enum(BOOKING_MODES),
  // Percentage in the UI (0–50); stored as basis points by the action.
  commissionPct: z.coerce.number().min(0, 'commission_range').max(50, 'commission_range'),
  status: z.enum(EXPERIENCE_STATUSES),
  // Unchecked checkbox → '' → false; 'on' → true.
  featured: z.coerce.boolean(),
  blackoutDatesRaw: z
    .string()
    .transform(datesFromTextarea)
    .pipe(z.array(z.string().regex(ISO_DATE_RE, 'blackout_invalid'))),
});

export type AdminExperienceInput = z.infer<typeof adminExperienceSchema>;

/** Create needs everything edit needs, plus the owning host. */
export const adminCreateExperienceSchema = adminExperienceSchema.extend({
  hostId: z.string().uuid('host_required'),
});

export type AdminCreateExperienceInput = z.infer<typeof adminCreateExperienceSchema>;
