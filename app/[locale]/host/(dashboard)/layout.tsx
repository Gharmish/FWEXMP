import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
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
 * The shell (left rail + top bar) IS the chrome: the `<style>` below hides
 * the public marketing navbar + footer (rendered by the parent locale
 * layout) on host dashboard routes. Sign-out + language switch are lifted
 * from that navbar into the rail footer so hosts keep them.
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

  const [t, tHost, pendingRequests] = await Promise.all([
    getTranslations('nav'),
    getTranslations('hostDashboard.nav'),
    countPendingRequestsForHost(),
  ]);

  // Help goes to the WhatsApp support line (agent-staffed) with the host
  // pre-identified — the dashboard had no support entry at all before
  // (2026-08-22 audit P2-9).
  const supportNumber = supportWhatsappE164();
  const supportHref = supportNumber
    ? whatsappLink(supportNumber, tHost('helpMessage', { name: dashboard.host.name }))
    : null;

  return (
    <>
      <style>{`[data-site-chrome]{display:none!important}`}</style>
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
    </>
  );
}
