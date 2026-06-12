import 'server-only';

import { hasEmail, serverEnv } from '@/lib/env';
import { sendEmail } from '@/lib/email';
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
  | 'settle_anomaly'
  | 'cron_failed';

const SUBJECTS: Record<AdminAlertKind, string> = {
  host_application_submitted: 'New host application',
  dispute_opened: 'New dispute opened',
  refund_due: 'Refund owed — manual reversal required',
  settle_anomaly: 'Payment settlement anomaly',
  cron_failed: 'Scheduled job failed',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
    const subject = `[Gharmish admin] ${SUBJECTS[kind]}`;
    const text = [SUBJECTS[kind], ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
    const html = [
      `<p><strong>${escapeHtml(SUBJECTS[kind])}</strong></p>`,
      '<ul>',
      ...rows.map(([k, v]) => `<li>${escapeHtml(k)}: ${escapeHtml(String(v))}</li>`),
      '</ul>',
    ].join('');

    await sendEmail({ to: serverEnv.ADMIN_ALERT_EMAIL, subject, html, text });
  } catch (error) {
    reportError(error, { surface: 'admin-alerts', kind });
  }
}
