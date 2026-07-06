import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { AdminShell } from '@/features/admin/dashboard/components/admin-shell';
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
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) notFound();

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('nav');

  return (
    <>
      <style>{`[data-site-chrome]{display:none!important}`}</style>
      <AdminShell
        userLabel={user.phone || (user.email ?? 'Admin')}
        actions={
          <>
            <SignOutButton locale={locale} label={t('signOut')} />
            <LanguageSwitcher />
          </>
        }
      >
        {children}
      </AdminShell>
    </>
  );
}
