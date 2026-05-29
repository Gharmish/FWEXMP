import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Wordmark } from '@/components/layout/wordmark';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { getCurrentUser } from '@/features/auth/queries';
import { currentUserIsHost } from '@/features/host-dashboard/queries';

/** Compact identity for the nav — last 4 digits of the canonical phone. */
function phoneTail(phone: string): string {
  return phone.length >= 4 ? `·· ${phone.slice(-4)}` : phone;
}

/**
 * Sticky, blurred top nav. Restraint-first (BRIEF §3): no shadow, a
 * single 0.5px bottom hairline, brand tokens only. Logical spacing so
 * it mirrors cleanly in RTL. Links are intentionally minimal — no dead
 * links until the routes exist.
 */
export async function Navbar() {
  const locale = (await getLocale()) as Locale;
  const [t, user, isHost] = await Promise.all([
    getTranslations('nav'),
    getCurrentUser(),
    currentUserIsHost(),
  ]);

  return (
    <header className="border-sarat-black/8 bg-fog-white/80 sticky top-0 z-50 [border-bottom-width:0.5px] backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark locale={locale} />
        <div className="flex items-center gap-1 sm:gap-5">
          <Link
            href="/experiences"
            className="text-sarat-black inline-flex min-h-11 items-center px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2"
          >
            {t('discover')}
          </Link>
          {user ? (
            <>
              {isHost && (
                <Link
                  href="/host"
                  className="text-sarat-black inline-flex min-h-11 items-center px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2"
                >
                  {t('hostDashboard')}
                </Link>
              )}
              <Link
                href="/me"
                className="text-sarat-black inline-flex min-h-11 items-center gap-2 px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2"
                aria-label={t('account')}
              >
                <span aria-hidden>{t('account')}</span>
                <span className="text-sarat-black-600 hidden text-xs sm:inline" dir="ltr">
                  {phoneTail(user.phone)}
                </span>
              </Link>
              <SignOutButton locale={locale} label={t('signOut')} />
            </>
          ) : (
            <Link
              href="/sign-in"
              className="text-sarat-black inline-flex min-h-11 items-center px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2"
            >
              {t('signIn')}
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}
