import 'server-only';

import { hasEmail, serverEnv } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import {
  sendWhatsAppTemplate,
  whatsappAddress,
  whatsappContentSid,
} from '@/lib/notifications/whatsapp';
import { SITE_URL } from '@/lib/site';
import { reportError } from '@/lib/log';

/**
 * Operational alerts to the team inbox (`ADMIN_ALERT_EMAIL`). These are
 * the events an operator must hear about without polling the admin
 * panel: work arriving (applications, disputes), money owed (refund
 * fallbacks), and infrastructure trouble (settlement anomalies, cron
 * failures). Internal-only — plain English, no translation layer.
 *
 * Best-effort like every sender: never throws, silent no-op until both
 * Resend and the alert inbox are configured.
 */

export type AdminAlertKind =
  | 'host_application_submitted'
  | 'dispute_opened'
  | 'refund_due'
  | 'payout_clawback'
  | 'settle_anomaly'
  | 'settle_stuck'
  | 'cron_failed'
  | 'cron_stale'
  | 'vat_stamp_missing'
  | 'vat_threshold'
  | 'negative_take'
  | 'guest_whatsapp_inbound';

const SUBJECTS: Record<AdminAlertKind, string> = {
  host_application_submitted: 'New host application',
  dispute_opened: 'New dispute opened',
  refund_due: 'Refund owed — manual reversal required',
  payout_clawback: 'Refund after payout — host clawback recorded',
  settle_anomaly: 'Payment settlement anomaly',
  settle_stuck: 'Payments stuck in processing for over 24h',
  cron_failed: 'Scheduled job failed',
  cron_stale: 'Maintenance cron has stopped running',
  vat_stamp_missing: 'VAT integrity — settled payments without a VAT stamp',
  vat_threshold: 'VAT registration threshold approaching',
  negative_take: 'Bookings settled at a negative platform take',
  guest_whatsapp_inbound: 'New WhatsApp message from a guest',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Amounts arrive as bare integers under `…Sar` keys; label the unit. */
function formatDetail(key: string, value: string | number): string {
  return typeof value === 'number' && /sar$/i.test(key) ? `SAR ${value}` : String(value);
}

export async function notifyAdmin(
  kind: AdminAlertKind,
  detail: Record<string, string | number | null | undefined>,
): Promise<void> {
  // Two independent rails, each best-effort (2026-08-02 ops audit P0-7).
  // Email alone meant every operational alert rode Resend — the vendor
  // whose outage is itself one of the alerts. Each rail is inert until
  // its own config exists, and a failure on one never blocks the other.
  try {
    if (hasEmail() && serverEnv.ADMIN_ALERT_EMAIL) {
      const rows = Object.entries(detail).filter(
        (entry): entry is [string, string | number] => entry[1] != null && entry[1] !== '',
      );
      // Actionable destination: booking-shaped alerts land on the bookings
      // queue; everything else on the dashboard. Saves the operator a
      // UUID-paste round-trip.
      const adminUrl =
        kind === 'guest_whatsapp_inbound' && typeof detail.from === 'string'
          ? `${SITE_URL}/en/admin/guests?q=${encodeURIComponent(detail.from)}`
          : 'bookingId' in detail || 'reference' in detail
            ? `${SITE_URL}/en/admin/bookings`
            : `${SITE_URL}/en/admin`;
      const subject = `[Gharmish admin] ${SUBJECTS[kind]}`;
      const text = [
        SUBJECTS[kind],
        ...rows.map(([k, v]) => `${k}: ${formatDetail(k, v)}`),
        '',
        adminUrl,
      ].join('\n');
      const html = [
        `<p><strong>${escapeHtml(SUBJECTS[kind])}</strong></p>`,
        '<ul>',
        ...rows.map(([k, v]) => `<li>${escapeHtml(k)}: ${escapeHtml(formatDetail(k, v))}</li>`),
        '</ul>',
        `<p><a href="${escapeHtml(adminUrl)}">Open the admin panel</a></p>`,
      ].join('');

      await sendEmail({ to: serverEnv.ADMIN_ALERT_EMAIL, subject, html, text });
    }
  } catch (error) {
    reportError(error, { surface: 'admin-alerts', kind });
  }

  try {
    // WhatsApp rail: requires the recipient phone AND a Meta-approved
    // `admin_alert` Content template (one body variable — the subject).
    // Deliberately terse: the email above carries the detail rows; this
    // is the "go look" tap on the shoulder that survives a Resend outage.
    const to = whatsappAddress(serverEnv.ADMIN_ALERT_WHATSAPP);
    const contentSid = whatsappContentSid('admin_alert', 'en');
    if (to && contentSid) {
      await sendWhatsAppTemplate({ to, contentSid, variables: { '1': SUBJECTS[kind] } });
    }
  } catch (error) {
    reportError(error, { surface: 'admin-alerts:whatsapp', kind });
  }
}
