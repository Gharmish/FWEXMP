import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { pickClientMessages } from '@/lib/client-messages';
import { redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getCurrentUser } from '@/features/auth/queries';
import { supportWhatsappE164 } from '@/lib/env';
import { whatsappLink } from '@/lib/whatsapp';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { countPendingRequestsForHost } from '@/features/host-bookings/queries';
import { HostShell } from '@/features/host-dashboard/components/host-shell';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';

/**
 * Host dashboard gate + shell. Signed-out visitors go to sign-in;
 * signed-in users without a `hosts` row go to `/host/apply` (which lives
 * outside this `(dashboard)` route group precisely so applicants aren't
 * gated by it). The check runs on every request to every child route, so
 * individual pages don't need to re-gate — they still call queries that
 * re-scope defensively (defence in depth), mirroring the admin layout.
 *
 * The shell (left rail + top bar) IS the chrome: the public navbar + footer
 * belong to the (site) route group's layout, a sibling of this segment, so
 * they are never rendered here (REACT-05). Sign-out + language switch are
 * lifted from that navbar into the rail footer so hosts keep them. The
 * nested NextIntlClientProvider ships the host namespaces from a layout that
 * re-renders on navigation (REACT-01, second-pass verification F5).
 */
// Belt for the gate above: even if a gate regression ever served dashboard
// HTML to a crawler, the pages stay out of the index (robots.txt already
// disallows the path, but robots.txt doesn't forbid indexing a URL).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function HostDashboardLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host', locale });
  }
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale });
  }

  const [t, tHost, pendingRequests, messages] = await Promise.all([
    getTranslations('nav'),
    getTranslations('hostDashboard.nav'),
    countPendingRequestsForHost(),
    getMessages(),
  ]);

  // Help goes to the WhatsApp support line (agent-staffed) with the host
  // pre-identified — the dashboard had no support entry at all before
  // (2026-08-22 audit P2-9).
  const supportNumber = supportWhatsappE164();
  const supportHref = supportNumber
    ? whatsappLink(supportNumber, tHost('helpMessage', { name: dashboard.host.name }))
    : null;

  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, 'host')}>
      <HostShell
        userLabel={dashboard.host.name}
        pendingRequests={pendingRequests}
        canCreate={dashboard.host.verificationStatus !== 'suspended'}
        supportHref={supportHref}
        actions={
          <>
            <SignOutButton locale={locale} label={t('signOut')} />
            <LanguageSwitcher />
          </>
        }
      >
        {children}
      </HostShell>
    </NextIntlClientProvider>
  );
}
