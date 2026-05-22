import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/layout/wordmark';

/**
 * Restrained footer (BRIEF §3): a single 0.5px top hairline, no shadow,
 * brand tokens only. Wordmark + tagline, a quiet two-column nav row,
 * and the copyright line.
 */
export async function Footer() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();
  const brand = locale === 'ar' ? 'غارميش' : 'Gharmish';

  const links: Array<{ href: string; label: string }> = [
    { href: '/experiences', label: t('linkExperiences') },
    { href: '/hosts', label: t('linkHosts') },
    { href: '/wishlist', label: t('linkWishlist') },
    { href: '/me', label: t('linkMe') },
  ];

  return (
    <footer className="border-sarat-black/8 [border-top-width:0.5px]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-3">
            <Wordmark locale={locale} />
            <p className="text-sarat-black-600 max-w-md text-base">{t('tagline')}</p>
          </div>
          <nav aria-label={t('exploreLabel')} className="flex flex-col gap-2">
            <p
              className={cn(
                'text-sarat-black-600 text-[11px]',
                locale === 'en' && 'tracking-[0.2em] uppercase',
              )}
            >
              {t('exploreLabel')}
            </p>
            <ul className="flex flex-col gap-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sarat-black inline-flex min-h-11 items-center text-sm font-medium transition-opacity duration-200 hover:opacity-60"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-sarat-black/8 text-sarat-black-600 flex flex-col gap-1 [border-top-width:0.5px] pt-6 text-sm">
          <span>
            © {year} {brand}. {t('rights')}
          </span>
          <span>{t('region')}</span>
        </div>
      </div>
    </footer>
  );
}
