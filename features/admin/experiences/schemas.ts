import { z } from 'zod';
import { isArPlaceholder } from '@/lib/ar-placeholder';
import { hostExperienceInputSchema } from '@/features/listings/schemas';

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

// Coordinates are omitted: the meeting point belongs to the host's map
// picker, and the admin editor neither renders nor writes lat/lng —
// inheriting the requirement made every admin save fail validation.
const adminExperienceBase = hostExperienceInputSchema.omit({ lat: true, lng: true }).extend({
  // Arabic copy — admins may author/correct it directly (the no-AI-Arabic
  // rule is about the assistant, not the human operator).
  // `TODO(ar)` markers are refused outright (2026-08-02 ops audit):
  // this schema is the ONLY Arabic gate on the admin path — an admin
  // can set `status: 'live'` directly, bypassing the moderation
  // approve action's placeholder check, and settlement snapshots the
  // raw titleAr onto IMMUTABLE invoices (`bookings.invoice_item_ar`).
  // Length alone let the literal marker publish and get invoiced.
  titleAr: z
    .string()
    .trim()
    .min(2, 'title_ar_short')
    .max(160, 'title_ar_long')
    .refine((v) => !isArPlaceholder(v), 'title_ar_placeholder'),
  descriptionAr: z
    .string()
    .trim()
    .min(10, 'description_ar_short')
    .max(5000, 'description_ar_long')
    .refine((v) => !isArPlaceholder(v), 'description_ar_placeholder'),
  // Optional editorial story ("The story behind this experience" on the
  // detail page). Blank = no story: the action stores NULL and the
  // guest-facing section hides itself. Bounds mirror the host-profile
  // story (features/host-profile/schemas.ts); the Arabic side also
  // refuses the TODO(ar) marker like every admin-authored ar column.
  storyEn: z
    .string()
    .trim()
    .max(2000, 'story_long')
    .refine((v) => v.length === 0 || v.length >= 80, 'story_short')
    .default(''),
  storyAr: z
    .string()
    .trim()
    .max(2000, 'story_ar_long')
    .refine((v) => v.length === 0 || v.length >= 80, 'story_ar_short')
    .refine((v) => !isArPlaceholder(v), 'story_ar_placeholder')
    .default(''),
  startTime: z.string().regex(HHMM_RE, 'start_time_invalid'),
  bookingMode: z.enum(BOOKING_MODES),
  // Percentage in the UI (0–50); stored as basis points by the action.
  commissionPct: z.coerce.number().min(0, 'commission_range').max(50, 'commission_range'),
  status: z.enum(EXPERIENCE_STATUSES),
  // Unchecked checkbox → '' → false; 'on' → true.
  featured: z.coerce.boolean(),
  // Blackout dates are managed on the visual calendar (single source of
  // truth), not this form — see features/availability.
});

/**
 * The moderation approve action refuses a listing whose English list has
 * no Arabic counterpart; an admin publishing straight to `live` from this
 * editor bypasses that action, so the same parity holds here (third-round
 * verification N7). Drafts and paused listings may still be half-done.
 */
type AdminListsInput = {
  status: string;
  inclusionsRaw: string[];
  inclusionsArRaw: string[];
  whatToBringRaw: string[];
  whatToBringArRaw: string[];
};
function requireArabicListsWhenLive(v: AdminListsInput, ctx: z.RefinementCtx): void {
  if (v.status !== 'live') return;
  if (v.inclusionsRaw.length > 0 && v.inclusionsArRaw.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['inclusionsArRaw'], message: 'inclusions_ar_required' });
  }
  if (v.whatToBringRaw.length > 0 && v.whatToBringArRaw.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['whatToBringArRaw'],
      message: 'what_to_bring_ar_required',
    });
  }
}

export const adminExperienceSchema = adminExperienceBase.superRefine(requireArabicListsWhenLive);
export type AdminExperienceInput = z.infer<typeof adminExperienceSchema>;

/** Create needs everything edit needs, plus the owning host. */
export const adminCreateExperienceSchema = adminExperienceBase
  .extend({ hostId: z.uuid('host_required') })
  .superRefine(requireArabicListsWhenLive);

export type AdminCreateExperienceInput = z.infer<typeof adminCreateExperienceSchema>;
