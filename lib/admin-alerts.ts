import 'server-only';

import { hasEmail, serverEnv } from '@/lib/env';
import { sendEmail } from '@/lib/email';
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
  | 'vat_stamp_missing'
  | 'vat_threshold'
  | 'negative_take';

const SUBJECTS: Record<AdminAlertKind, string> = {
  host_application_submitted: 'New host application',
  dispute_opened: 'New dispute opened',
  refund_due: 'Refund owed — manual reversal required',
  payout_clawback: 'Refund after payout — host clawback recorded',
  settle_anomaly: 'Payment settlement anomaly',
  settle_stuck: 'Payments stuck in processing for over 24h',
  cron_failed: 'Scheduled job failed',
  vat_stamp_missing: 'VAT integrity — settled payments without a VAT stamp',
  vat_threshold: 'VAT registration threshold approaching',
  negative_take: 'Bookings settled at a negative platform take',
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
  try {
    if (!hasEmail() || !serverEnv.ADMIN_ALERT_EMAIL) return;

    const rows = Object.entries(detail).filter(
      (entry): entry is [string, string | number] => entry[1] != null && entry[1] !== '',
    );
    // Actionable destination: booking-shaped alerts land on the bookings
    // queue; everything else on the dashboard. Saves the operator a
    // UUID-paste round-trip.
    const adminUrl =
      'bookingId' in detail || 'reference' in detail
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
  } catch (error) {
    reportError(error, { surface: 'admin-alerts', kind });
  }
}
