'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Pill } from '@/components/ui/pill';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import { cn } from '@/lib/utils';
import type { CategoryMeta } from '@/features/experiences/types';
import {
  DURATION_BUCKETS,
  PRICE_BUCKETS,
  EMPTY_CRITERIA,
  hasActiveFilters,
  parseSearchParams,
  toSearchParams,
  type DurationBucket,
  type ExperienceCriteria,
  type PriceBucket,
} from '@/features/experiences/lib/search';

interface FilterBarProps {
  locale: Locale;
  categories: readonly CategoryMeta[];
  /**
   * Total matches under the *current* criteria. Surfaced inline so the
   * filter row doubles as a result counter.
   */
  resultCount: number;
  /**
   * Distinct operating cities in the catalog (display casing). The city
   * select renders only when there's more than one — Abha-only at
   * launch means it stays hidden until expansion.
   */
  cities: readonly string[];
  /** Today in Riyadh, `YYYY-MM-DD` — the date input's minimum. */
  todayStr: string;
}

/**
 * Filter row for /experiences. Reads the criteria from the URL,
 * renders a category chip strip plus an Originals toggle, and writes
 * changes back to the URL with router.replace (so back/forward and
 * deep-links work without client state).
 */
export function FilterBar({ locale, categories, resultCount, cities, todayStr }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('experiencesIndex');

  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing === undefined) {
      params[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      params[key] = [existing, value];
    }
  });
  const criteria = parseSearchParams(params);

  function push(next: ExperienceCriteria) {
    const qs = toSearchParams(next).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function toggleCategory(key: CategoryMeta['key']) {
    const set = new Set(criteria.categories);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    push({ ...criteria, categories: Array.from(set) as ExperienceCriteria['categories'] });
  }

  function toggleOriginals() {
    push({ ...criteria, originalsOnly: !criteria.originalsOnly });
  }

  function togglePrice(bucket: PriceBucket) {
    // Single-select — picking the active one clears it.
    push({ ...criteria, priceBucket: criteria.priceBucket === bucket ? null : bucket });
  }

  function toggleDuration(bucket: DurationBucket) {
    push({ ...criteria, durationBucket: criteria.durationBucket === bucket ? null : bucket });
  }

  function reset() {
    push(EMPTY_CRITERIA);
  }

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );
  const resultsLabel = t('results', { count: resultCount });

  return (
    <div
      className={cn('flex flex-col gap-4', isPending && 'opacity-70 transition-opacity')}
      data-pending={isPending ? 'true' : undefined}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className={eyebrowClassName}>{resultsLabel}</p>
        {hasActiveFilters(criteria) && (
          <button
            type="button"
            onClick={reset}
            className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center text-sm transition-opacity duration-200 hover:opacity-60"
          >
            {t('reset')}
          </button>
        )}
      </div>

      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        <Pill
          selected={criteria.originalsOnly}
          onClick={toggleOriginals}
          aria-label={t('originalsToggleAria')}
        >
          {t('originalsToggle')}
        </Pill>
        {categories.map((c) => (
          <Pill
            key={c.key}
            category={c.key}
            selected={criteria.categories.includes(c.key)}
            onClick={() => toggleCategory(c.key)}
          >
            {locale === 'ar' ? c.labelAr : c.labelEn}
          </Pill>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <fieldset className="flex flex-col gap-2">
          <legend className={eyebrowClassName}>
            {t('priceLegend')} (<RiyalSymbol className="h-[0.9em] align-[-0.1em]" />)
          </legend>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {PRICE_BUCKETS.map((bucket) => (
              <Pill
                key={bucket}
                selected={criteria.priceBucket === bucket}
                onClick={() => togglePrice(bucket)}
              >
                {t(`price.${bucket}`)}
              </Pill>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={eyebrowClassName}>{t('durationLegend')}</legend>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {DURATION_BUCKETS.map((bucket) => (
              <Pill
                key={bucket}
                selected={criteria.durationBucket === bucket}
                onClick={() => toggleDuration(bucket)}
              >
                {t(`duration.${bucket}`)}
              </Pill>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Trip shape — when, how many, where. */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className={eyebrowClassName}>{t('dateLegend')}</span>
          <input
            type="date"
            value={criteria.date ?? ''}
            min={todayStr}
            onChange={(e) => push({ ...criteria, date: e.target.value || null })}
            className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-base"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={eyebrowClassName}>{t('groupLegend')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={criteria.groupSize ?? ''}
            placeholder={t('groupPlaceholder')}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              push({ ...criteria, groupSize: Number.isFinite(n) && n >= 1 ? n : null });
            }}
            className="rounded-input border-sarat-black/20 text-sarat-black h-11 w-28 [border-width:0.5px] bg-white px-3 text-base"
            dir="ltr"
          />
        </label>
        {cities.length > 1 && (
          <label className="flex flex-col gap-2">
            <span className={eyebrowClassName}>{t('cityLegend')}</span>
            <select
              value={criteria.city}
              onChange={(e) => push({ ...criteria, city: e.target.value })}
              className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-base"
            >
              <option value="">{t('cityAll')}</option>
              {cities.map((city) => (
                <option key={city} value={city.toLowerCase()}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
