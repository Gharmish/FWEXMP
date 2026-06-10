import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Price } from '@/components/ui/price';

export interface LeaderboardRow {
  id: string;
  label: string;
  /** Optional link target (e.g. the public experience page); plain text when absent. */
  href?: string;
  bookings: number;
  gmvSar: number;
}

interface LeaderboardProps {
  rows: readonly LeaderboardRow[];
  locale: Locale;
  emptyLabel: string;
  /** Renders the localized "N bookings" plural string. */
  bookingsLabel: (count: number) => string;
}

/**
 * Ranked top-N list (top experiences / top hosts) — rank, name, booking
 * count, GMV. One hairline card, rows divided by 0.5px rules (BRIEF §3).
 */
export function Leaderboard({ rows, locale, emptyLabel, bookingsLabel }: LeaderboardProps) {
  if (rows.length === 0) {
    return <p className="text-sarat-black-600 text-sm">{emptyLabel}</p>;
  }

  return (
    <ol className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
      {rows.map((row, i) => (
        <li key={row.id} className="flex items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-sarat-black-600 text-sm tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            {row.href ? (
              <Link
                href={row.href}
                className="truncate text-base font-medium underline-offset-4 hover:underline"
              >
                {row.label}
              </Link>
            ) : (
              <span className="truncate text-base font-medium">{row.label}</span>
            )}
          </div>
          <div className="text-sarat-black-600 flex shrink-0 items-center gap-3 text-sm">
            <span>{bookingsLabel(row.bookings)}</span>
            <span aria-hidden>·</span>
            <span className="text-sarat-black font-medium">
              <Price amount={row.gmvSar} locale={locale} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
