import { ArrowRight } from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { pickLocalized } from '@/lib/ar-placeholder';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import type { HostExperienceRow } from '@/features/host-experiences/queries';

const STATUS_TONE: Record<HostExperienceRow['status'], string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-pending-surface text-pending',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-success-surface text-success',
  paused: 'bg-mist-deep text-sarat-black-600',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

interface ExperienceListRowProps {
  experience: HostExperienceRow;
  locale: Locale;
  copy: { status: string; perPerson: string; daysPerWeek: string; commissionShare: string };
}

/**
 * One row in the host's listings list — title, status tone, place, price,
 * weekly cadence. Shared by the overview and the experiences index.
 */
export function ExperienceListRow({ experience, locale, copy }: ExperienceListRowProps) {
  return (
    <li>
      <Link
        href={`/host/experiences/${experience.id}`}
        className="hover:bg-sarat-black/[0.02] flex items-center justify-between gap-4 p-5 transition-colors duration-200"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* The host reads their own listing in their own language —
                placeholder-guarded fallback to EN (lib/ar-placeholder). */}
            <span className="truncate text-base font-medium">
              {pickLocalized(locale, experience.titleEn, experience.titleAr)}
            </span>
            <Badge className={STATUS_TONE[experience.status]}>{copy.status}</Badge>
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {/* A fresh draft has no place or price yet — skip the blanks
                rather than render "0 per guest". */}
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
            <span aria-hidden>·</span>
            <span>{copy.commissionShare}</span>
          </div>
        </div>
        <ArrowRight className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}
