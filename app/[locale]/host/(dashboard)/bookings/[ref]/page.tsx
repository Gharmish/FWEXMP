import { redirect } from '@/lib/i18n';

/**
 * Clean deep link for WhatsApp buttons (`/host/bookings/GH-7K3M9X`).
 * The host bookings surface is a filtered list; this resolves the
 * reference into that list's search so the button lands on exactly the
 * booking the message was about. Auth and host scoping happen on the
 * list page itself.
 */
export default async function HostBookingDeepLink({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  const q = ref.trim().slice(0, 20);
  redirect({ href: { pathname: '/host/bookings', query: { q } }, locale });
}
