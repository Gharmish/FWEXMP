import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatTime } from '@/lib/format';
import { Draw, Stagger, StaggerItem } from '@/components/ui/motion';
import type { ActivityItem, ActivityKind } from '@/features/admin/activity/queries';

interface ActivityTimelineProps {
  items: readonly ActivityItem[];
  locale: Locale;
  emptyLabel: string;
  /** The `admin` namespace translator (event labels are resolved by key). */
  t: (key: string, values?: Record<string, string | number>) => string;
}

/** Dot colour per activity kind (BRIEF §3 category palette). */
const DOT_TONE: Record<ActivityKind, string> = {
  experience: 'bg-sarawat-blue',
  application: 'bg-saffron-gold',
  host: 'bg-juniper-green',
};

/** Which i18n namespace resolves the event label for each kind. */
const EVENT_NS: Record<ActivityKind, string> = {
  experience: 'moderationEvent',
  application: 'applicationEvent',
  host: 'hostStatusEvent',
};

/**
 * Recent platform activity as a vertical timeline — a hairline spine with a
 * tinted dot per row (moderation, applications, host changes). The dashboard
 * shows the most recent handful; the full feed lives at /admin/activity.
 */
export function ActivityTimeline({ items, locale, emptyLabel, t }: ActivityTimelineProps) {
  if (items.length === 0) {
    return <p className="text-sarat-black-600 text-base">{emptyLabel}</p>;
  }

  return (
    <Stagger>
      <ol className="flex flex-col">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const at = new Date(item.at);
          return (
            <li key={`${item.kind}-${item.id}`}>
              <StaggerItem className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT_TONE[item.kind]}`}
                    aria-hidden
                  />
                  {!last && (
                    <Draw className="mt-1 w-px flex-1">
                      <span className="bg-sarat-black/10 block size-full" aria-hidden />
                    </Draw>
                  )}
                </div>
                <div className={`flex min-w-0 flex-col gap-1 ${last ? '' : 'pb-6'}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-medium">
                      {t(`${EVENT_NS[item.kind]}.${item.event}`)}
                    </span>
                    <Link
                      href={item.targetHref}
                      className="text-sarat-black-600 truncate text-base underline-offset-4 hover:underline"
                    >
                      {item.targetLabel}
                    </Link>
                  </div>
                  <span className="text-sarat-black-600 text-sm">
                    {formatDate(at, locale)} · {formatTime(at, locale)}
                  </span>
                </div>
              </StaggerItem>
            </li>
          );
        })}
      </ol>
    </Stagger>
  );
}
