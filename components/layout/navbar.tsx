import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { NavShell } from '@/components/layout/nav-shell';
import { Wordmark } from '@/components/layout/wordmark';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

/** Compact identity for the nav — last 4 digits of the canonical phone. */
export function phoneTail(phone: string): string {
  return phone.length >= 4 ? `·· ${phone.slice(-4)}` : phone;
}

/**
 * Shared styling for nav links: icon + label, with the label collapsing
 * to icon-only below `sm` to keep the bar uncrowded on mobile. The icon
 * carries the accessible name via the link's `aria-label`, so hiding the
 * label visually is safe.
 */
export const navLinkClass =
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
export const hostNavLinkClass = `${navLinkClass} max-[380px]:hidden`;

/**
 * Sticky, blurred top nav. Restraint-first (BRIEF §3): no shadow, a
 * single 0.5px bottom hairline, brand tokens only. Logical spacing so
 * it mirrors cleanly in RTL. Links are intentionally minimal — no dead
 * links until the routes exist.
 */
export interface NavbarProps {
  /** Whether this device has saved anything — the heart entry point shows only then. */
  hasWishlist: boolean;
  /**
   * The signed-in/out section, rendered by the layout from the auth
   * feature (behind its own Suspense so the page's first byte never waits
   * on the two DB round-trips). The shell itself imports no feature
   * (2026-09 engineering audit ARCH-12).
   */
  authLinks: ReactNode;
}

export async function Navbar({ hasWishlist, authLinks }: NavbarProps) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('nav');

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
          {authLinks}
          <LanguageSwitcher />
        </div>
      </nav>
    </NavShell>
  );
}
