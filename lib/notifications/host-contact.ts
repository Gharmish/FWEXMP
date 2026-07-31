import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { Locale } from '@/lib/i18n';
import { hostApplications } from '@/db/schema';

/**
 * Notification contact for a host, resolved by host id — the non-booking
 * twin of `hostEmailContext` in booking-email.ts (which resolves via an
 * experience slug). Prefers `hosts.contact_email/phone` (copied from the
 * application at approval) with a fallback to the application row for
 * hosts approved before those columns existed. Returns null when neither
 * channel is addressable (seeded demo hosts) so senders no-op for them.
 */
export interface HostNotificationContact {
  email: string | null;
  phone: string | null;
  locale: Locale;
  name: string;
}

export async function hostNotificationContact(
  hostId: string,
): Promise<HostNotificationContact | null> {
  const host = await db.query.hosts.findFirst({
    where: (h) => eq(h.id, hostId),
    columns: { id: true, name: true, languages: true, contactEmail: true, contactPhone: true },
  });
  if (!host) return null;

  let email = host.contactEmail;
  let phone = host.contactPhone;
  if (!email || !phone) {
    const application = await db.query.hostApplications.findFirst({
      where: eq(hostApplications.hostId, host.id),
      columns: { contactEmail: true, contactPhone: true },
    });
    email = email ?? application?.contactEmail ?? null;
    phone = phone ?? application?.contactPhone ?? null;
  }
  if (!email && !phone) return null;

  // Hosts are Arabic-first: only an explicit leading 'en' flips the locale.
  const locale: Locale = host.languages[0] === 'en' ? 'en' : 'ar';
  return { email, phone, locale, name: host.name };
}
