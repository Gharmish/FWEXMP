import { z } from 'zod';
import { isValidSaudiIban, normalizeIban } from '@/features/host-applications/lib/iban';
import { normalizeToE164 } from '@/lib/phone';

/** Optional attribution label: trimmed, clamped, undefined over invalid. */
const utmLabel = z.string().trim().min(1).max(100).optional().catch(undefined);

/**
 * Optional ad-click identifier (gclid/ttclid/fbclid). Same best-effort
 * posture as `utmLabel`, but with a longer cap — Google's gclid alone
 * routinely exceeds 100 characters.
 */
const clickId = z.string().trim().min(1).max(255).optional().catch(undefined);

export const bookingRequestSchema = z.object({
  experienceSlug: z.string().min(1),
  locale: z.enum(['en', 'ar']),
  /**
   * Client-minted idempotency key (BRIEF §6 — safe retries, incl. AI
   * agents). Minted once when the form mounts, so a double-tap or a
   * network-layer re-POST re-delivers the SAME key and the unique
   * constraint dedupes the insert instead of creating a second booking.
   * Optional with a swallow-on-invalid catch: an absent or malformed key
   * falls back to a server-minted UUID (no retry protection, pre-2026-07
   * behavior) rather than failing the booking.
   */
  idempotencyKey: z.string().uuid().optional().catch(undefined),
  /**
   * Reference (idempotency-key UUID) of an earlier unpaid instant hold
   * this submission replaces — carried by the payment step's "change
   * date or guests" path. Best-effort like `idempotencyKey`: absent or
   * malformed degrades to undefined, and the action only releases the
   * named hold when the caller's ownership is provable.
   */
  supersedes: z.string().uuid().optional().catch(undefined),
  /**
   * Signed link token for {@link supersedes}. Proof the caller holds the
   * superseded booking's own link, so its hold can be released without a
   * same-device cookie. Best-effort: absent/invalid just means the
   * cookie is the only accepted proof.
   */
  supersedesToken: z.string().max(200).optional().catch(undefined),
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
  // Ceiling matches the host-side maxGroupSize cap (host-experiences
  // schema, 50) — the action still enforces each experience's own
  // `maxGroupSize` below it. The 'too_large' message is the field code
  // both the client mapper and the server echo already understand.
  partySize: z.coerce.number().int().min(1).max(50, 'too_large'),
  /**
   * Required contact email. Every lifecycle notification (approval +
   * pay link, cancellation, reminder, receipt) is email-only, so the
   * booking cannot proceed without one (owner decision 2026-07-09).
   * Empty → `required`; malformed → `invalid_email`. Always lowercased.
   */
  email: z
    .string()
    .trim()
    .max(254)
    .transform((raw, ctx) => {
      if (!raw) {
        ctx.addIssue({ code: 'custom', message: 'required' });
        return z.NEVER;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        ctx.addIssue({ code: 'custom', message: 'invalid_email' });
        return z.NEVER;
      }
      return raw.toLowerCase();
    }),
  /**
   * First-touch UTM attribution (see features/analytics/utm-capture).
   * Best-effort labels, never load-bearing: anything absent or oversized
   * degrades to undefined rather than failing the booking.
   */
  utmSource: utmLabel,
  utmMedium: utmLabel,
  utmCampaign: utmLabel,
  /**
   * Ad-platform click ids (forwarded from sessionStorage exactly like the
   * UTM triplet) — feed offline-conversion uploads, never load-bearing.
   */
  gclid: clickId,
  ttclid: clickId,
  fbclid: clickId,
  /** `?ref=` guest referral code (see lib/marketing/referral.ts) — same posture. */
  referralCode: clickId,
  /**
   * Marketing-consent checkbox ('on' when ticked). Optional and
   * unchecked by default — unlike `terms`, absence never blocks the
   * booking; it only means no marketing messages.
   */
  marketingConsent: z
    .string()
    .optional()
    .transform((value) => value === 'on')
    .catch(false),
  /**
   * Optional note to the host (2026-08-22 host-dashboard audit P1-3):
   * dietary needs, kids' ages, pickup point, language. Trimmed, ≤500
   * chars; blank stores null. Never load-bearing — an oversized note is
   * a validation error, not a dropped booking.
   */
  guestNote: z
    .string()
    .trim()
    .max(500, 'too_long')
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

/**
 * Guest cancellation. The booking is addressed by its public reference
 * (the idempotency-key UUID); the action separately verifies the caller
 * may act on it (owner session or last-booking cookie).
 */
/**
 * Payee details for a MANUAL (bank-transfer) refund — owner decision
 * 2026-08-21: every refund is wired by hand, so the guest tells us where
 * the money goes. Saudi IBAN only (SA + 22, mod-97), same rule as host
 * payout IBANs. Names are free text (bank apps print them in either
 * script); trimmed and length-bounded.
 */
export const refundBankDetailsSchema = z.object({
  bankName: z.string().trim().min(2, 'bank_name_invalid').max(80, 'bank_name_invalid'),
  beneficiaryName: z
    .string()
    .trim()
    .min(2, 'beneficiary_name_invalid')
    .max(80, 'beneficiary_name_invalid'),
  iban: z.string().transform(normalizeIban).refine(isValidSaudiIban, 'iban_invalid'),
});

export type RefundBankDetailsInput = z.infer<typeof refundBankDetailsSchema>;

export const submitRefundBankDetailsSchema = refundBankDetailsSchema.extend({
  reference: z.string().uuid(),
  locale: z.enum(['en', 'ar']),
});

/**
 * Cancellation: the bank fields are OPTIONAL here — a cancellation that
 * refunds nothing (unpaid, forfeited) never shows them. When a refund IS
 * owed the page renders them `required`, and `cancelBookingCore` refuses
 * a guest cancellation that arrives without them.
 */
export const cancelBookingSchema = z.object({
  reference: z.string().uuid(),
  locale: z.enum(['en', 'ar']),
  bankDetails: refundBankDetailsSchema.optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const rescheduleBookingSchema = z.object({
  reference: z.string().uuid(),
  locale: z.enum(['en', 'ar']),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
