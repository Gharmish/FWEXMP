import 'server-only';

import { hasEmail, serverEnv } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { whatsappPayload } from '@/lib/notifications/whatsapp';
import { SITE_URL } from '@/lib/site';
import { reportError } from '@/lib/log';
import { db } from '@/lib/db';
import { adminAlerts } from '@/db/schema';

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
  | 'guest_whatsapp_inbound'
  | 'support_ticket_opened'
  | 'support_ticket_sla_breached';

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
  support_ticket_opened: 'Support ticket opened',
  support_ticket_sla_breached: 'Support ticket past its SLA',
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
  // Persist first (2026-08-21): the rails below are fire-and-forget, so
  // this row is the only record that an alert ever happened — what the
  // admin acknowledges later and what SLA sweeps check. Best-effort.
  let alertId: string | null = null;
  try {
    if (serverEnv.DATABASE_URL) {
      const ticketId = typeof detail.ticketId === 'string' ? detail.ticketId : null;
      const [row] = await db
        .insert(adminAlerts)
        .values({ kind, subject: SUBJECTS[kind], detail, ticketId })
        .returning({ id: adminAlerts.id });
      alertId = row?.id ?? null;
    }
  } catch (error) {
    reportError(error, { surface: 'admin-alerts:persist', kind });
  }

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
          : kind.startsWith('support_ticket') && typeof detail.conversationId === 'string'
            ? `${SITE_URL}/en/admin/support/${detail.conversationId}`
            : kind.startsWith('support_ticket')
              ? `${SITE_URL}/en/admin/support`
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
    // WhatsApp rail (`ADMIN_ALERT_WHATSAPP`): the registry's `admin_alert`
    // template through the dispatcher, so it is ledgered, deduped per
    // persisted alert row, and status-tracked like every other send.
    // The summary line is built from safe keys only — never detail rows
    // that could carry PII or secrets.
    const phone = serverEnv.ADMIN_ALERT_WHATSAPP;
    if (phone) {
      const summary = [detail.ticket, detail.reference, detail.priority, detail.category, detail.job]
        .filter((v): v is string | number => v != null && v !== '')
        .map(String)
        .join(' · ');
      await dispatchNotification({
        type: 'admin_alert',
        dedupeKey: alertId ? `admin_alert:${alertId}` : undefined,
        recipient: { kind: 'admin', phone, locale: 'en' },
        whatsapp: whatsappPayload('admin_alert', 'en', {
          subject: SUBJECTS[kind],
          summary: summary || kind,
          adminPath:
            typeof detail.conversationId === 'string'
              ? `en/admin/support/${detail.conversationId}`
              : kind.startsWith('support_ticket')
                ? 'en/admin/support'
                : 'en/admin',
        }),
      });
    }
  } catch (error) {
    reportError(error, { surface: 'admin-alerts:whatsapp', kind });
  }
}
