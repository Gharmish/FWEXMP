import { StarRating } from '@/components/ui/star-rating';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { RecentReview } from '@/features/admin/dashboard/metrics-types';

interface FeedbackCardProps {
  reviews: readonly RecentReview[];
  locale: Locale;
  emptyLabel: string;
  repliedLabel: string;
  awaitingReplyLabel: string;
  starsOnlyLabel: string;
}

/**
 * The latest guest reviews as words, not just a distribution: stars, the
 * guest's text (clamped), experience, host, and whether the host has
 * replied. Low ratings get the error tone so they are scanned first.
 * Each row links to the public listing; the card header links to the
 * moderation list.
 */
export function FeedbackCard({
  reviews,
  locale,
  emptyLabel,
  repliedLabel,
  awaitingReplyLabel,
  starsOnlyLabel,
}: FeedbackCardProps) {
  if (reviews.length === 0) {
    return <p className="text-sarat-black-600 text-sm">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-sarat-black/12 flex flex-col divide-y">
      {reviews.map((r) => {
        const low = r.rating <= 3;
        return (
          <li key={r.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <StarRating
                rating={r.rating}
                label={`${r.rating}/5`}
                size="sm"
                tone={low ? 'low' : 'default'}
              />
              <span className="text-sarat-black-600 text-xs">
                {formatDate(r.createdAt, locale)} ·{' '}
                <span className={cn(!r.hasHostReply && 'text-warning font-medium')}>
                  {r.hasHostReply ? repliedLabel : awaitingReplyLabel}
                </span>
              </span>
            </div>
            {/* Guest text keeps its own script direction inside either admin locale. */}
            <p dir="auto" className="text-sarat-black line-clamp-2 text-sm leading-relaxed">
              {r.text ?? <span className="text-sarat-black-600 italic">{starsOnlyLabel}</span>}
            </p>
            <p className="text-sarat-black-600 truncate text-xs">
              <Link
                href={r.experienceHref}
                className="hover:text-sarat-black underline-offset-2 hover:underline"
              >
                {r.experienceLabel}
              </Link>{' '}
              · {r.hostLabel}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
