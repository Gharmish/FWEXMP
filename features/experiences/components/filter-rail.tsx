'use client';

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { CategoryMeta } from '@/features/experiences/types';
import { CategoryStrip } from '@/features/experiences/components/category-strip';
import { ActiveFilters } from '@/features/experiences/components/active-filters';
import { FilterSheet } from '@/features/experiences/components/filter-sheet';
import {
  EMPTY_CRITERIA,
  hasActiveFilters,
  parseSearchParams,
  toSearchParams,
  type ExperienceCriteria,
  type FilterableExperience,
} from '@/features/experiences/lib/search';

/**
 * M21: the result count was already `aria-live`, but the grid's FadeSwap
 * wrapper had no `aria-busy` while a filter/sort change is in flight —
 * this context shares one `isPending` between every control that writes
 * the URL (FilterRail, MobileSearchEntry) and the grid wrapper in the
 * server-rendered catalog page, since a page-level useTransition can't
 * otherwise cross that server/client boundary.
 */
const CatalogTransitionContext = createContext<{
  isPending: boolean;
  startTransition: (callback: () => void) => void;
} | null>(null);

export function CatalogTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <CatalogTransitionContext.Provider value={{ isPending, startTransition }}>
      {children}
    </CatalogTransitionContext.Provider>
  );
}

export function useCatalogTransition() {
  const ctx = useContext(CatalogTransitionContext);
  if (!ctx) {
    throw new Error('useCatalogTransition must be used within a CatalogTransitionProvider');
  }
  return ctx;
}

/** Wraps the catalog grid so it reports `aria-busy` while the shared
 * transition (any filter/sort/category change) is in flight. */
export function CatalogGridStatus({ children }: { children: ReactNode }) {
  const { isPending } = useCatalogTransition();
  return <div aria-busy={isPending}>{children}</div>;
}

interface FilterRailProps {
  locale: Locale;
  categories: readonly CategoryMeta[];
  /** Total matches under the current criteria (server-computed). */
  resultCount: number;
  /** Distinct operating cities (display casing). */
  cities: readonly string[];
  /** Full-catalogue projection powering the sheet's live count. */
  facets: readonly FilterableExperience[];
}

/**
 * Two-tier filter rail for /experiences (replaces the flat FilterBar).
 *
 * Tier 1 is always visible: a sticky category strip + Originals, an "All
 * filters" button badged with the count of active advanced facets, and a
 * removable-token summary. Tier 2 (price, duration, when, group, city)
 * lives in {@link FilterSheet}. All state is URL-driven — router.replace
 * keeps back/forward and deep-links working with no client store.
 */
export function FilterRail({ locale, categories, resultCount, cities, facets }: FilterRailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isPending, startTransition } = useCatalogTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useTranslations('experiencesIndex');

  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else params[key] = [existing, value];
  });
  const criteria = parseSearchParams(params);

  function push(next: ExperienceCriteria) {
    const qs = toSearchParams(next).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function toggleCategory(key: Category) {
    const set = new Set(criteria.categories);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    push({ ...criteria, categories: Array.from(set) as ExperienceCriteria['categories'] });
  }

  const advancedCount = [
    criteria.priceBucket !== null,
    criteria.durationBucket !== null,
    criteria.dayPreset !== null,
    criteria.groupSize !== null,
    criteria.city.length > 0,
  ].filter(Boolean).length;

  return (
    <div
      className={cn('flex flex-col gap-4', isPending && 'opacity-70 transition-opacity')}
      data-pending={isPending ? 'true' : undefined}
    >
      {/* P2-5: below `lg` the category strip + "All filters" trigger live
          in MobileSearchEntry instead, directly under the search field
          near the top of the page — this bar would otherwise duplicate
          them two screens down, past the Featured section. */}
      <div className="border-sarat-black/8 sticky top-16 z-30 -mx-6 hidden items-center gap-3 [border-bottom-width:0.5px] bg-white/90 px-6 py-3 backdrop-blur-md lg:flex">
        <div className="min-w-0 flex-1">
          <CategoryStrip
            locale={locale}
            categories={categories}
            selectedCategories={criteria.categories}
            onToggleCategory={toggleCategory}
            originalsOnly={criteria.originalsOnly}
            onToggleOriginals={() => push({ ...criteria, originalsOnly: !criteria.originalsOnly })}
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          // The visible label is `hidden sm:inline` and the icon is
          // aria-hidden, so below `sm` this button had NO accessible name
          // — a screen-reader user on a 375px phone heard only "button"
          // and the whole tier-2 filter surface was undiscoverable
          // (2026-07-28 fifth audit). Majority-mobile audience.
          aria-label={t('filtersButton')}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 inline-flex h-11 shrink-0 items-center gap-2 rounded-full [border-width:0.5px] ps-4 pe-4 text-sm font-medium transition-colors duration-200"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t('filtersButton')}</span>
          {advancedCount > 0 && (
            <span className="bg-sarat-black inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-white tabular-nums">
              {advancedCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* The RSC grid swap is visual-only (FadeSwap); this count is the
            one node that re-renders with every filter change, so it doubles
            as the screen-reader status line. */}
        <p
          aria-live="polite"
          className={cn(
            'text-sarat-black-600 shrink-0 text-[11px] font-medium',
            locale === 'en' && 'tracking-[0.2em] uppercase',
          )}
        >
          {t('results', { count: resultCount })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ActiveFilters
            criteria={criteria}
            cities={cities}
            onRemove={(patch) => push({ ...criteria, ...patch })}
          />
          {hasActiveFilters(criteria) && (
            <button
              type="button"
              onClick={() => push(EMPTY_CRITERIA)}
              className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 shrink-0 items-center text-sm transition-opacity duration-200 hover:opacity-60"
            >
              {t('reset')}
            </button>
          )}
        </div>
      </div>

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        criteria={criteria}
        facets={facets}
        cities={cities}
        onApply={(next) => {
          push(next);
          setSheetOpen(false);
        }}
      />
    </div>
  );
}
