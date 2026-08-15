import type { Locale } from '@/lib/i18n';
import type { EmailAttachment } from '@/lib/email';

/**
 * Shared types for the notification dispatcher (see dispatch.ts).
 * A "notification" is one logical message to one person, fanned out to
 * whichever channels are configured and addressable for them.
 */

/** Who a notification goes to — recorded on the delivery ledger row. */
export type NotificationRecipientType = 'guest' | 'host' | 'applicant';

/**
 * WhatsApp template keys. Each key maps to a Meta-approved Content
 * template (per locale) via the `TWILIO_WHATSAPP_CONTENT_SIDS` env JSON;
 * a key with no approved SID simply skips the WhatsApp channel. The
 * variable order each template expects is the contract documented in
 * docs/notifications/twilio-setup.md — keep the two in sync.
 */
export type WhatsAppTemplateKey =
  | 'booking_confirmed'
  /** Image-header variant: same body as `booking_confirmed` + media var 8. */
  | 'booking_confirmed_media'
  | 'booking_request_received'
  | 'booking_approved'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'host_booking_rescheduled'
  | 'booking_reminder_24h'
  /** Image-header variant: same body as `booking_reminder_24h` + media var 7. */
  | 'booking_reminder_24h_media'
  | 'booking_reminder_3h'
  /**
   * Payment-hold rail (2026-08-15 marketing audit): the same body serves
   * both sends — "your spot is held until {deadline}, complete payment" —
   * fired once at instant-booking creation and once ~2h before the hold
   * lapses. Until Meta approves the template, both degrade to email-only.
   */
  | 'booking_payment_reminder'
  /**
   * Post-experience review invitation (2026-08-15 marketing audit) — the
   * review invite was email-only in a phone-primary market, so phone-only
   * guests received zero post-trip contact. Email fallback until approved.
   */
  | 'booking_completed_review'
  | 'host_new_booking'
  | 'host_new_request'
  | 'host_guest_cancelled'
  | 'host_payment_received'
  /**
   * Operational alert to the platform's own inbox phone
   * (`ADMIN_ALERT_WHATSAPP`) — the second alert rail beside the Resend
   * email (2026-08-02 ops audit P0-7). One body variable: the alert
   * subject line. Register + approve the template, then add its SID
   * under `admin_alert` (locale-less is fine — operator-facing English).
   */
  | 'admin_alert';

export interface NotificationRecipient {
  kind: NotificationRecipientType;
  /** Email address, when the person has one on file. */
  email?: string | null;
  /** E.164 phone, when the person has one on file. */
  phone?: string | null;
  locale: Locale;
}

export interface EmailPayload {
  subject: string;
  html: string;
  text?: string;
  attachments?: readonly EmailAttachment[];
}

export interface WhatsAppPayload {
  template: WhatsAppTemplateKey;
  /**
   * Used when `template` has no approved Content SID yet — lets a caller
   * prefer a richer variant (e.g. the image-header `*_media` template)
   * while the plain one keeps working until Meta approves it. The
   * fallback's body must accept the same leading variables; extra
   * trailing variables are ignored.
   */
  fallbackTemplate?: WhatsAppTemplateKey;
  /**
   * Numbered Content-template variables (`{"1": "...", "2": "..."}`).
   * Every value must be non-empty — WhatsApp rejects templates rendered
   * with blank variables, so callers pass fallbacks.
   */
  variables: Record<string, string>;
}

export interface DispatchInput {
  /** Notification type slug, e.g. `booking_confirmed`. Ledgered as-is. */
  type: string;
  /**
   * Idempotency key, e.g. `booking_confirmed:GH-7K3M9X`. At most one
   * send per (dedupeKey, channel) ever — double-fired flows (payment
   * return route + gateway webhook, hourly cron re-runs) collapse to
   * one message. Omit ONLY for legitimately repeatable notifications
   * (e.g. application decisions across resubmit cycles); those are
   * still ledgered, just never deduped.
   */
  dedupeKey?: string;
  /** The booking this is about, for the per-booking ledger timeline. */
  bookingId?: string | null;
  /**
   * Marketing message (rebook nudge, win-back) rather than transactional.
   * Marketing respects marketing-scope suppressions on top of the full
   * do-not-contact list, and callers must ALSO gate on the guest's
   * `marketingConsentAt` before dispatching — consent lives on the guest
   * row, not the address.
   */
  marketing?: boolean;
  recipient: NotificationRecipient;
  email?: EmailPayload;
  whatsapp?: WhatsAppPayload;
}
