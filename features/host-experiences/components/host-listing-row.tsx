import Image from 'next/image';
import { ArrowRight, ImageOff, Star } from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { pickLocalized } from '@/lib/ar-placeholder';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import type { HostExperienceRow, HostListingStats } from '@/features/host-experiences/queries';

const STATUS_TONE: Record<HostExperienceRow['status'], string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-pending-surface text-pending',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-success-surface text-success',
  paused: 'bg-mist-deep text-sarat-black-600',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

/** Listing statuses in "what needs me" order for the host's index. */
export const HOST_LISTING_STATUS_ORDER: readonly HostExperienceRow['status'][] = [
  'changes_requested',
  'pending_review',
  'live',
  'paused',
  'draft',
  'archived',
];

interface HostListingRowProps {
  experience: HostExperienceRow;
  stats?: HostListingStats;
  locale: Locale;
  copy: {
    status: string;
    perPerson: string;
    daysPerWeek: string;
    bookings30d: string;
    noRating: string;
    /** Status-specific next step, when the status needs one. */
    nextStep?: string;
    noPhoto: string;
  };
}

/**
 * One row in the host's listings index (2026-08-22 audit P2-5): hero
 * thumbnail, title + status, the two numbers that say how the listing
 * is doing (30-day bookings, rating), and a next-step line for statuses
 * that need the host's attention. The commission split lives on the
 * listing's own page, not on every row.
 */
export function HostListingRow({ experience, stats, locale, copy }: HostListingRowProps) {
  const rating =
    stats && stats.ratingAverage !== null
      ? new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
          numberingSystem: 'latn',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(stats.ratingAverage)
      : null;
  return (
    <li>
      <Link
        href={`/host/experiences/${experience.id}`}
        className="hover:bg-sarat-black/[0.02] flex items-center gap-4 p-4 transition-colors duration-200 sm:p-5"
      >
        <span className="bg-mist relative size-16 shrink-0 overflow-hidden rounded-[10px] sm:size-20">
          {experience.heroImage ? (
            <Image src={experience.heroImage} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <span
              className="text-sarat-black-600 flex size-full items-center justify-center"
              title={copy.noPhoto}
            >
              <ImageOff className="size-5" aria-hidden />
              <span className="sr-only">{copy.noPhoto}</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate text-base font-medium">
              {pickLocalized(locale, experience.titleEn, experience.titleAr)}
            </span>
            <Badge className={STATUS_TONE[experience.status]}>{copy.status}</Badge>
          </span>
          <span className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {experience.placeName !== '' && (
              <>
                <span>{experience.placeName}</span>
                <span aria-hidden>·</span>
              </>
            )}
            {experience.priceSar > 0 && (
              <>
                <span>
                  <Price amount={experience.priceSar} locale={locale} /> {copy.perPerson}
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{copy.daysPerWeek}</span>
          </span>
          <span className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="tabular-nums">{copy.bookings30d}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Star
                className={cn(
                  'size-3.5',
                  rating ? 'text-saffron-gold fill-current' : 'text-sarat-black/30',
                )}
                aria-hidden
              />
              {rating ?? copy.noRating}
            </span>
          </span>
          {copy.nextStep && (
            <span
              className={cn(
                'text-sm font-medium',
                experience.status === 'changes_requested' ? 'text-rijal-clay' : 'text-sarat-black',
              )}
            >
              {copy.nextStep}
            </span>
          )}
        </span>
        <ArrowRight className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}
