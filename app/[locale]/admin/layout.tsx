import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { mfaRequirement } from '@/features/admin/mfa';
import { AdminMfaGate } from '@/features/admin/components/admin-mfa-gate';
import { AdminShell } from '@/features/admin/dashboard/components/admin-shell';
import { getAdminNavCounts } from '@/features/admin/dashboard/nav-counts';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';

/**
 * Admin gate. Anyone not on the `ADMIN_PHONES` allowlist gets a 404 —
 * not a 401, not a redirect. We don't want to advertise that `/admin`
 * exists to logged-in non-admins or signed-out crawlers.
 *
 * The check runs on every request to every child route, so individual
 * pages don't need to re-gate. They still call queries that re-gate
 * defensively (defence in depth).
 *
 * The shell (left rail + top bar) wraps every admin page and IS the chrome:
 * the `<style>` below hides the public marketing navbar + footer (rendered by
 * the parent locale layout) on admin routes, so the rail stands alone like the
 * mockup. Sign-out + language switch are lifted from that navbar into the rail
 * footer so admins keep them. The inner `max-w-6xl` content column preserves
 * the width pages were authored for.
 */
// Belt for the gate above: even if a gate regression ever served admin
// HTML to a crawler, the pages stay out of the index (robots.txt already
// disallows the path, but robots.txt doesn't forbid indexing a URL).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) notFound();

  // Second factor (2026-08-02 security audit). Rendered IN PLACE of the
  // admin app rather than redirected to, so there is no route to forget
  // to protect and no exempt-path list to get wrong — every admin page
  // nests under this layout. Stub-mode dev has no Supabase and therefore
  // no TOTP, so it skips the gate (never production — `stubAuthAllowed`).
  const requirement = user.isStub ? 'ok' : mfaRequirement(user.mfa);

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('nav');

  // Rail attention badges (P2-19) — fetched only past the MFA gate, since an
  // admin who hasn't verified this session shouldn't get counts either.
  const navCounts = requirement === 'ok' ? await getAdminNavCounts() : {};

  return (
    <>
      <style>{`[data-site-chrome]{display:none!important}`}</style>
      <AdminShell
        userLabel={user.phone || (user.email ?? 'Admin')}
        navCounts={navCounts}
        actions={
          <>
            <SignOutButton locale={locale} label={t('signOut')} />
            <LanguageSwitcher />
          </>
        }
      >
        {requirement === 'ok' ? children : <AdminMfaGate mode={requirement} />}
      </AdminShell>
    </>
  );
}
