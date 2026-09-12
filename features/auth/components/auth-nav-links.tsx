import { getTranslations } from 'next-intl/server';
import { LogIn, Store, User } from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { hostNavLinkClass, navLinkClass, phoneTail } from '@/components/layout/nav-link-styles';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { getCurrentUser } from '@/features/auth/queries';
import { currentUserIsHost } from '@/features/host-dashboard/queries';

export interface AuthNavLinksProps {
  locale: Locale;
}

/** The signed-in/out section of the nav — the only part that hits the DB. */
export async function AuthNavLinks({ locale }: AuthNavLinksProps) {
  const [t, user, isHost] = await Promise.all([
    getTranslations('nav'),
    getCurrentUser(),
    currentUserIsHost(),
  ]);

  return (
    <>
      {/* Supply acquisition is the scarcest pre-launch resource — the
          host entry point lives in the bar, not just the footer.
          Existing hosts see their dashboard instead. */}
      {!isHost && (
        <Link href="/hosting" className={hostNavLinkClass} aria-label={t('becomeHost')}>
          <Store className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">{t('becomeHost')}</span>
        </Link>
      )}
      {user ? (
        <>
          {isHost && (
            <Link href="/host" className={hostNavLinkClass} aria-label={t('hostDashboard')}>
              <Store className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="hidden sm:inline">{t('hostDashboard')}</span>
            </Link>
          )}
          <Link href="/me/profile" className={navLinkClass} aria-label={t('account')}>
            <User className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">{t('account')}</span>
            <span className="text-sarat-black-600 hidden text-xs sm:inline" dir="ltr">
              {phoneTail(user.phone)}
            </span>
          </Link>
          <SignOutButton locale={locale} label={t('signOut')} />
        </>
      ) : (
        <Link href="/sign-in" className={navLinkClass} aria-label={t('signIn')}>
          <LogIn className="size-5 shrink-0 rtl:rotate-180" strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">{t('signIn')}</span>
        </Link>
      )}
    </>
  );
}
