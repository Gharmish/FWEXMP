import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/site';
import { getPlatformSettings } from '@/lib/platform-settings';
import { Wordmark } from '@/components/layout/wordmark';
import { Stagger, StaggerItem } from '@/components/ui/motion';

/**
 * Restrained footer (BRIEF §3): a single 0.5px top hairline, no shadow,
 * brand tokens only. Wordmark + tagline, a quiet two-column nav row,
 * and the copyright line.
 */
export async function Footer() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();
  // The VAT registration number appears only once the platform actually
  // collects VAT — advertising one unregistered is a ZATCA violation.
  const { vatEnabled, vatRegistrationNumber } = await getPlatformSettings();
  const registrationLine =
    vatEnabled && vatRegistrationNumber
      ? t('crVatLine', { vat: vatRegistrationNumber })
      : t('crLine');
  const brand = locale === 'ar' ? 'غارميش' : 'Gharmish';

  const exploreLinks: Array<{ href: string; label: string }> = [
    { href: '/experiences', label: t('linkExperiences') },
    { href: '/hosts', label: t('linkHosts') },
    { href: '/host/apply', label: t('linkHostApply') },
  ];

  const accountLinks: Array<{ href: string; label: string }> = [
    { href: '/wishlist', label: t('linkWishlist') },
    { href: '/me', label: t('linkMe') },
  ];

  const supportLinks: Array<{ href: string; label: string }> = [
    { href: '/how-it-works', label: t('linkHowItWorks') },
    { href: '/trust-and-safety', label: t('linkTrustSafety') },
    { href: '/cancellation-policy', label: t('linkCancellation') },
    { href: '/help', label: t('linkHelp') },
  ];

  const legalLinks: Array<{ href: string; label: string }> = [
    { href: '/terms', label: t('linkTerms') },
    { href: '/privacy', label: t('linkPrivacy') },
  ];

  // Text pills, not brand logos: the palette rule (BRIEF §3) rules out the
  // brands' own colours, and the checkout widget already shows the real marks.
  const paymentBrands = [t('brandMada'), t('brandVisa'), t('brandMastercard'), t('brandApplePay')];

  const bottomLinkClassName =
    'text-sarat-black inline-flex min-h-11 items-center text-sm font-medium transition-opacity duration-200 hover:opacity-60';

  const columnLabelClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  const renderColumn = (label: string, links: Array<{ href: string; label: string }>) => (
    <nav aria-label={label} className="flex flex-col gap-2">
      <p className={columnLabelClassName}>{label}</p>
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
  );

  return (
    <footer data-site-chrome className="border-sarat-black/8 [border-top-width:0.5px] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <Stagger className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <StaggerItem className="flex flex-col gap-3">
            <Wordmark locale={locale} />
            <p className="text-sarat-black-600 max-w-md text-base">{t('tagline')}</p>
          </StaggerItem>
          <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
            <StaggerItem>{renderColumn(t('exploreLabel'), exploreLinks)}</StaggerItem>
            <StaggerItem>{renderColumn(t('accountLabel'), accountLinks)}</StaggerItem>
            <StaggerItem>{renderColumn(t('supportLabel'), supportLinks)}</StaggerItem>
          </div>
        </Stagger>
        <div className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-6 text-sm">
          <nav aria-label={t('legalLabel')} className="flex flex-wrap items-center gap-x-6">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className={bottomLinkClassName}>
                {link.label}
              </Link>
            ))}
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={bottomLinkClassName}>
              {SUPPORT_EMAIL}
            </a>
          </nav>
          <ul aria-label={t('paymentsLabel')} className="flex flex-wrap items-center gap-2">
            {paymentBrands.map((brand) => (
              <li
                key={brand}
                className="border-sarat-black/8 text-sarat-black-600 rounded-md [border-width:0.5px] px-2.5 py-1 text-xs font-medium"
              >
                {brand}
              </li>
            ))}
          </ul>
          <div className="text-sarat-black-600 flex flex-col gap-1">
            <span>
              © {year} {brand}. {t('rights')}
            </span>
            <span>{t('region')}</span>
            <span>{registrationLine}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
