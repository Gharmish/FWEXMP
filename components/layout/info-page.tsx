import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

/**
 * Shared chassis for the public information pages (Trust & Safety,
 * How it works, Cancellation policy, Help). Editorial, type-forward,
 * white base — one max-width column with hairline-separated sections.
 */

export interface InfoSection {
  heading: string;
  body: ReactNode;
}

export interface InfoRelatedLink {
  href: string;
  label: string;
}

interface InfoPageProps {
  locale: Locale;
  eyebrow: string;
  title: string;
  intro: string;
  sections: readonly InfoSection[];
  /** Cross-links to sibling info pages, rendered as a closing nav block. */
  related?: readonly InfoRelatedLink[];
  /** Accessible heading for the related-links block; required with `related`. */
  relatedLabel?: string;
  /** Optional extra content rendered after the sections (e.g. FAQ list). */
  children?: ReactNode;
}

export function InfoPage({
  locale,
  eyebrow,
  title,
  intro,
  sections,
  related,
  relatedLabel,
  children,
}: InfoPageProps) {
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-20 sm:py-24">
      <header className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
          {title}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">{intro}</p>
      </header>

      {sections.map((section) => (
        <section
          key={section.heading}
          className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-10"
        >
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {section.heading}
          </h2>
          <div className="text-sarat-black-600 flex flex-col gap-3 text-base leading-relaxed">
            {section.body}
          </div>
        </section>
      ))}

      {children}

      {related && related.length > 0 && relatedLabel ? (
        <nav
          aria-label={relatedLabel}
          className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] pt-10"
        >
          <p className={eyebrowClassName}>{relatedLabel}</p>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-1">
            {related.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sarat-black inline-flex min-h-11 items-center text-base font-medium transition-opacity duration-200 hover:opacity-60"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  );
}
