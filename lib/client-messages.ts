import type { AbstractIntlMessages } from 'next-intl';

/**
 * Which message namespaces reach the browser (2026-09 engineering audit
 * REACT-01). The whole catalog (237–313 KB) used to be serialised into
 * every page's RSC payload; client components only ever call
 * `useTranslations` on the namespaces below, and the admin/host ones are
 * needed only on their own routes. lib/client-messages.test.ts scans every
 * `'use client'` component so a new namespace cannot be silently dropped.
 */
export const CLIENT_NAMESPACES = {
  base: [
    'common',
    'error',
    'nav',
    'cookieNotice',
    'share',
    'wishlistButton',
    'verifiedBadge',
    'reviews',
    'experiencesIndex',
    'bookingRequest',
  ],
  admin: ['admin', 'adminMfa'],
  host: ['hostDashboard', 'hostBookings'],
} as const;

const ADMIN = /^\/(?:en|ar)\/admin(?:\/|$)/;
const HOST = /^\/(?:en|ar)\/host(?:\/|$)/;

export function clientNamespacesFor(pathname: string | null | undefined): readonly string[] {
  const out: string[] = [...CLIENT_NAMESPACES.base];
  // No pathname (a render outside the proxy) ships everything the client
  // could need rather than risk a raw key.
  if (!pathname || ADMIN.test(pathname)) out.push(...CLIENT_NAMESPACES.admin);
  if (!pathname || HOST.test(pathname)) out.push(...CLIENT_NAMESPACES.host);
  return out;
}

export function pickClientMessages(
  messages: AbstractIntlMessages,
  pathname: string | null | undefined,
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of clientNamespacesFor(pathname)) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out;
}
