import type { AbstractIntlMessages } from 'next-intl';

/**
 * Which message namespaces reach the browser (2026-09 engineering audit
 * REACT-01). The whole catalog (237–313 KB) used to be serialised into
 * every page's RSC payload; client components only ever call
 * `useTranslations` on the namespaces below. `base` ships from the locale
 * layout; `admin` and `host` ship from the dashboards' own layouts through
 * a nested provider — those layouts re-render on navigation, the locale
 * layout does not (second-pass verification F5). lib/client-messages.test.ts
 * scans every `'use client'` component so a new namespace cannot be
 * silently dropped, and pins which layout provides which group.
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

export type ClientNamespaceGroup = keyof typeof CLIENT_NAMESPACES;

export function clientNamespacesFor(...groups: readonly ClientNamespaceGroup[]): readonly string[] {
  const out = new Set<string>(CLIENT_NAMESPACES.base);
  for (const group of groups) for (const ns of CLIENT_NAMESPACES[group]) out.add(ns);
  return [...out];
}

export function pickClientMessages(
  messages: AbstractIntlMessages,
  ...groups: readonly ClientNamespaceGroup[]
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of clientNamespacesFor(...groups)) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out;
}
