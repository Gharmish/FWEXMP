import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, Heart, LogIn, Store, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { WISHLIST_COOKIE, parseWishlistCookie } from '@/features/wishlist/cookie';
import { NavShell } from '@/components/layout/nav-shell';
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
  'text-sarat-black inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2';

/**
 * The host entry point steps out of the bar below 380px.
 *
 * Signed in, the bar carries five 44px targets — 220px of touch target
 * before the wordmark, gaps or padding, which cannot fit 320px however
 * the spacing is tuned; the bar overflowed and scrolled the whole
 * document sideways. Signed out there are four and it fits, which is why
 * this only ever reproduced with a session cookie (2026-08-09).
 *
 * The host link is the one item that is safely droppable: `/hosting` is
 * also in the footer and on the home page. Discover, the account link and
 * the language switcher are all essential, and sign-out lives ONLY here —
 * hiding any of those would strand the user. Shrinking the targets below
 * 44px was the alternative and loses more (BRIEF §6 accessibility).
 */
const hostNavLinkClass = `${navLinkClass} max-[380px]:hidden`;

/**
 * Sticky, blurred top nav. Restraint-first (BRIEF §3): no shadow, a
 * single 0.5px bottom hairline, brand tokens only. Logical spacing so
 * it mirrors cleanly in RTL. Links are intentionally minimal — no dead
 * links until the routes exist.
 */
export async function Navbar() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('nav');
  // Cookie-only read (no DB): the heart entry point shows once this
  // device has saved anything — an empty wishlist earns no nav slot.
  const store = await cookies();
  const hasWishlist = parseWishlistCookie(store.get(WISHLIST_COOKIE)?.value).length > 0;

  return (
    <NavShell>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark locale={locale} />
        <div className="flex items-center gap-1 sm:gap-6">
          <Link href="/experiences" className={navLinkClass} aria-label={t('discover')}>
            <Compass className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">{t('discover')}</span>
          </Link>
          {/* `hidden sm:inline-flex`: below `sm` the signed-in bar already
              runs at its 320px limit (see hostNavLinkClass) — mobile keeps
              the post-save toast + footer as its routes to /wishlist. */}
          {hasWishlist && (
            <Link
              href="/wishlist"
              className={cn(navLinkClass, 'hidden sm:inline-flex')}
              aria-label={t('wishlist')}
            >
              <Heart className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="hidden sm:inline">{t('wishlist')}</span>
            </Link>
          )}
          {/* The auth-dependent links need two DB round-trips
              (getCurrentUser + currentUserIsHost). Streaming them behind
              Suspense keeps every page's first byte off that critical path
              — previously the whole app waited on the navbar. The page
              itself stays OUTSIDE any boundary, so notFound()/redirect()
              status codes are unaffected (see the locale layout comment). */}
          <Suspense fallback={<span className="min-h-11 min-w-11" aria-hidden />}>
            <AuthNavLinks locale={locale} />
          </Suspense>
          <LanguageSwitcher />
        </div>
      </nav>
    </NavShell>
  );
}

/** The signed-in/out section of the nav — the only part that hits the DB. */
async function AuthNavLinks({ locale }: { locale: Locale }) {
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
