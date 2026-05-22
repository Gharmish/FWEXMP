import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Wordmark } from '@/components/layout/wordmark';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

/**
 * Sticky, blurred top nav. Restraint-first (BRIEF §3): no shadow, a
 * single 0.5px bottom hairline, brand tokens only. Logical spacing so
 * it mirrors cleanly in RTL. Links are intentionally minimal — no dead
 * links until the routes exist.
 */
export async function Navbar() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('nav');

  return (
    <header className="border-sarat-black/8 bg-fog-white/80 sticky top-0 z-50 [border-bottom-width:0.5px] backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark locale={locale} />
        <div className="flex items-center gap-6">
          <Link
            href="/experiences"
            className="text-sarat-black inline-flex min-h-11 items-center px-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
          >
            {t('discover')}
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}
