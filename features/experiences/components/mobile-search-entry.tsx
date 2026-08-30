'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter } from '@/lib/i18n';
import { SearchInput } from '@/features/experiences/components/search-input';
import { FilterSheet } from '@/features/experiences/components/filter-sheet';
import {
  parseSearchParams,
  toSearchParams,
  type ExperienceCriteria,
  type FilterableExperience,
} from '@/features/experiences/lib/search';

interface MobileSearchEntryProps {
  /** Lightweight full-catalogue projection for the sheet's live count. */
  facets: readonly FilterableExperience[];
  /** Distinct operating cities (display casing). */
  cities: readonly string[];
}

/**
 * Compact search + "All filters" entry for small screens, rendered under
 * the catalog hero so a first-time mobile guest doesn't have to scroll
 * past the whole Featured block to discover that search and filters
 * exist (the full FilterRail only becomes sticky once reached). Renders
 * its own FilterSheet instance; both this and the rail are pure URL
 * writers, so they can never disagree. The parent hides this at `lg:`
 * — the desktop layout keeps its controls beside the grid.
 */
export function MobileSearchEntry({ facets, cities }: MobileSearchEntryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
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

  const advancedCount = [
    criteria.priceBucket !== null,
    criteria.durationBucket !== null,
    criteria.dayPreset !== null,
    criteria.groupSize !== null,
    criteria.city.length > 0,
  ].filter(Boolean).length;

  function apply(next: ExperienceCriteria) {
    const qs = toSearchParams(next).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
    setSheetOpen(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <SearchInput />
      </div>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={t('filtersButton')}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        className="border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 inline-flex h-11 shrink-0 items-center gap-2 rounded-full [border-width:0.5px] ps-4 pe-4 text-sm font-medium transition-colors duration-200"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {advancedCount > 0 && (
          <span className="bg-sarat-black inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-white tabular-nums">
            {advancedCount}
          </span>
        )}
      </button>
      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        criteria={criteria}
        facets={facets}
        cities={cities}
        onApply={apply}
      />
    </div>
  );
}
