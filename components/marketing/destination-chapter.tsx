import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import { Link } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { Draw, FadeIn } from '@/components/ui/motion';

/**
 * Destination chapter — the place-story band ("Chapter one: Aseer").
 * Presentation-only expansion architecture: the chapter number, name,
 * and narrative arrive as already-translated props, so adding a future
 * destination is a new message block + one more render, never a schema
 * or component change. Editorial ghost numeral + drawn hairline echo
 * the WhyGharmish manifesto treatment; no imagery until real
 * destination photography exists (no-fabrication rule).
 */
export interface DestinationChapterProps {
  locale: Locale;
  /** Two-digit editorial numeral, e.g. "01" — always rendered LTR. */
  number: string;
  /** Eyebrow label, e.g. "Chapter one". */
  label: string;
  title: string;
  /** Narrative paragraphs, rendered in order. */
  paragraphs: string[];
  cta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

export function DestinationChapter({
  locale,
  number,
  label,
  title,
  paragraphs,
  cta,
  secondaryCta,
}: DestinationChapterProps) {
  // Arabic reads one type-scale step up (BRIEF §3): 11px + tracking is an
  // EN small-caps treatment — Arabic gets 13px with no added tracking.
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium',
    locale === 'en' ? 'text-[11px] tracking-[0.2em] uppercase' : 'text-[13px]',
  );

  return (
    <section className="border-sarat-black/8 [border-top-width:0.5px]">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <FadeIn className="flex flex-col gap-4">
            <Draw axis="x">
              <span className="bg-sarat-black/15 block h-px w-full" />
            </Draw>
            <span
              aria-hidden
              className="font-display text-sarat-black-200 text-7xl font-medium tracking-[-0.04em]"
              dir="ltr"
            >
              {number}
            </span>
            <p className={eyebrowClassName}>{label}</p>
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">
              {title}
            </h2>
          </FadeIn>
          <FadeIn delay={0.1} className="flex flex-col gap-5 lg:pt-24">
            {paragraphs.map((p) => (
              <p
                key={p}
                className="text-sarat-black-600 max-w-[62ch] text-lg leading-relaxed rtl:text-xl"
              >
                {p}
              </p>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-5">
              <Link href={cta.href} className={cn(buttonVariants({ variant: 'primary' }))}>
                {cta.label}
              </Link>
              {secondaryCta && (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
                >
                  {secondaryCta.label}
                  <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                </Link>
              )}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
