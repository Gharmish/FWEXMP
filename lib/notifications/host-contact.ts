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
  /** Null when the host has no email on file OR has switched the channel off. */
  email: string | null;
  /** Null when the host has no phone on file OR has switched the channel off. */
  phone: string | null;
  locale: Locale;
  name: string;
  /** Optional-category opt-ins; senders of those categories check these. */
  prefs: { reminders: boolean; reviews: boolean };
}

/**
 * Apply the host's channel toggles to their addresses (2026-08-22). A
 * switched-off channel reads as "no address", so every sender and the
 * dispatcher stay unchanged — the dispatcher simply has nothing to send
 * on that channel. The action that saves the toggles guarantees at least
 * one channel stays on.
 */
export function applyChannelPrefs<T extends { email: string | null; phone: string | null }>(
  contact: T,
  prefs: { notifyEmail: boolean; notifyWhatsapp: boolean },
): T {
  return {
    ...contact,
    email: prefs.notifyEmail ? contact.email : null,
    phone: prefs.notifyWhatsapp ? contact.phone : null,
  };
}

export interface HostContactOptions {
  /**
   * Account-critical notice (suspension, reinstatement, dispute opened,
   * payment hold lapsed): delivered regardless of the host's channel
   * toggles. These exist only as email, so honouring an "email off"
   * toggle would make them vanish — the 2026-07-31 comms audit's exact
   * regression. The profile copy tells hosts these always arrive.
   */
  critical?: boolean;
}

/**
 * The host's raw notification addresses — `hosts.contact_*` with the
 * approved application as fallback — BEFORE channel toggles. Shared by
 * the resolvers below and by the preferences form/action, which need to
 * know whether a kept-on channel can actually reach the host.
 */
export async function hostContactAddresses(
  hostId: string,
): Promise<{ email: string | null; phone: string | null } | null> {
  const host = await db.query.hosts.findFirst({
    where: (h) => eq(h.id, hostId),
    columns: { id: true, contactEmail: true, contactPhone: true },
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
  return { email, phone };
}

export async function hostNotificationContact(
  hostId: string,
  options: HostContactOptions = {},
): Promise<HostNotificationContact | null> {
  const host = await db.query.hosts.findFirst({
    where: (h) => eq(h.id, hostId),
    columns: {
      id: true,
      name: true,
      languages: true,
      contactEmail: true,
      contactPhone: true,
      notifyEmail: true,
      notifyWhatsapp: true,
      notifyReminders: true,
      notifyReviews: true,
    },
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
  if (!options.critical) ({ email, phone } = applyChannelPrefs({ email, phone }, host));
  if (!email && !phone) return null;

  // Hosts are Arabic-first: only an explicit leading 'en' flips the locale.
  const locale: Locale = host.languages[0] === 'en' ? 'en' : 'ar';
  return {
    email,
    phone,
    locale,
    name: host.name,
    prefs: { reminders: host.notifyReminders, reviews: host.notifyReviews },
  };
}
