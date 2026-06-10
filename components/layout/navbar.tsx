import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, LogIn, Store, User } from 'lucide-react';
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
 * Shared styling for nav links: icon + label, with the label collapsing
 * to icon-only below `sm` to keep the bar uncrowded on mobile. The icon
 * carries the accessible name via the link's `aria-label`, so hiding the
 * label visually is safe.
 */
const navLinkClass =
  'text-sarat-black inline-flex min-h-11 items-center gap-2 px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2';

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
    <header className="border-sarat-black/8 bg-fog-white/80 sticky top-0 z-50 [border-bottom-width:0.5px] backdrop-blur-md print:hidden">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark locale={locale} />
        <div className="flex items-center gap-1 sm:gap-5">
          <Link href="/experiences" className={navLinkClass} aria-label={t('discover')}>
            <Compass className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">{t('discover')}</span>
          </Link>
          {user ? (
            <>
              {isHost && (
                <Link href="/host" className={navLinkClass} aria-label={t('hostDashboard')}>
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
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}
