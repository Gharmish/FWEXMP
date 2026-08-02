import { ChevronDown } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/site';
import { getPlatformSettings } from '@/lib/platform-settings';
import { GharmishLockup } from '@/components/layout/gharmish-lockup';
import { PaymentMarks } from '@/components/layout/payment-marks';
import { Stagger, StaggerItem } from '@/components/ui/motion';

interface FooterLink {
  href: string;
  label: string;
}

/**
 * Restrained footer (BRIEF §3): a single 0.5px top hairline, no shadow,
 * brand tokens only. The full Gharmish lockup, a quiet nav, and the
 * copyright line.
 *
 * The nav renders twice by breakpoint — no JS, one rendered per viewport:
 * desktop (`sm:`) shows the columns expanded side-by-side; mobile collapses
 * each into a native `<details>` accordion so the footer stays short. Only
 * the visible copy is in the a11y tree, so links are never announced twice.
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

  const columns: Array<{ label: string; links: FooterLink[] }> = [
    {
      label: t('exploreLabel'),
      links: [
        { href: '/experiences', label: t('linkExperiences') },
        { href: '/hosts', label: t('linkHosts') },
        { href: '/hosting', label: t('linkHostApply') },
      ],
    },
    {
      label: t('accountLabel'),
      links: [
        { href: '/wishlist', label: t('linkWishlist') },
        { href: '/me', label: t('linkMe') },
      ],
    },
    {
      label: t('supportLabel'),
      links: [
        { href: '/how-it-works', label: t('linkHowItWorks') },
        { href: '/trust-and-safety', label: t('linkTrustSafety') },
        { href: '/cancellation-policy', label: t('linkCancellation') },
        { href: '/help', label: t('linkHelp') },
      ],
    },
  ];

  const legalLinks: FooterLink[] = [
    { href: '/terms', label: t('linkTerms') },
    { href: '/privacy', label: t('linkPrivacy') },
  ];

  const linkClassName =
    'text-sarat-black inline-flex min-h-11 items-center text-sm font-medium transition-opacity duration-200 hover:opacity-60';
  const bottomLinkClassName = linkClassName;
  const columnLabelClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  const linkList = (links: FooterLink[], className?: string) => (
    <ul className={cn('flex flex-col gap-2', className)}>
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={linkClassName}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  // Desktop: a static labelled column.
  const renderColumn = ({ label, links }: { label: string; links: FooterLink[] }) => (
    <nav key={label} aria-label={label} className="flex flex-col gap-2">
      <p className={columnLabelClassName}>{label}</p>
      {linkList(links)}
    </nav>
  );

  // Mobile: the same column collapsed into a tap-to-open accordion.
  const renderAccordion = ({ label, links }: { label: string; links: FooterLink[] }) => (
    <details key={label} className="group border-sarat-black/8 [border-top-width:0.5px]">
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center justify-between',
          'text-sarat-black text-sm font-medium [&::-webkit-details-marker]:hidden',
        )}
      >
        {label}
        <ChevronDown
          className="text-sarat-black-600 size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <nav aria-label={label} className="pb-2">
        {linkList(links)}
      </nav>
    </details>
  );

  return (
    <footer data-site-chrome className="border-sarat-black/8 [border-top-width:0.5px] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <Stagger className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <StaggerItem className="flex flex-col gap-3">
            <Link
              href="/"
              aria-label="Gharmish"
              className="text-sarat-black inline-flex min-h-11 items-center"
            >
              <GharmishLockup className="h-7 w-auto sm:h-8" />
            </Link>
            <p className="text-sarat-black-600 max-w-md text-base">{t('tagline')}</p>
          </StaggerItem>

          {/* Desktop columns */}
          <StaggerItem className="hidden sm:flex sm:gap-16">
            {columns.map(renderColumn)}
          </StaggerItem>
        </Stagger>

        {/* Mobile accordions */}
        <div className="flex flex-col sm:hidden">{columns.map(renderAccordion)}</div>

        <div className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-6 text-sm">
          <nav aria-label={t('legalLabel')} className="flex flex-wrap items-center gap-x-6 gap-y-1">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className={bottomLinkClassName}>
                {link.label}
              </Link>
            ))}
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={bottomLinkClassName}>
              {SUPPORT_EMAIL}
            </a>
          </nav>
          <PaymentMarks
            label={t('paymentsLabel')}
            names={{
              mada: t('brandMada'),
              visa: t('brandVisa'),
              mastercard: t('brandMastercard'),
              applePay: t('brandApplePay'),
            }}
          />
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
