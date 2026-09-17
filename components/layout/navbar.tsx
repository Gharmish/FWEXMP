import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { NavShell } from '@/components/layout/nav-shell';
import { navLinkClass } from '@/components/layout/nav-link-styles';
import { Wordmark } from '@/components/layout/wordmark';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

/**
 * Sticky, blurred top nav. Restraint-first (BRIEF §3): no shadow, a
 * single 1px bottom hairline, brand tokens only. Logical spacing so
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
