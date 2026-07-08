'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import { cn } from '@/lib/utils';
import { GuestStepper } from '@/features/experiences/components/guest-stepper';
import {
  DAY_PRESETS,
  DURATION_BUCKETS,
  PRICE_BUCKETS,
  matchesCriteria,
  type ExperienceCriteria,
  type FilterableExperience,
} from '@/features/experiences/lib/search';

/** The subset of criteria this sheet owns. Category, Originals, query and
 * sort live outside the sheet (strip / search / sort control). */
type AdvancedDraft = Pick<
  ExperienceCriteria,
  'priceBucket' | 'durationBucket' | 'dayPreset' | 'groupSize' | 'city'
>;

function pickAdvanced(criteria: ExperienceCriteria): AdvancedDraft {
  return {
    priceBucket: criteria.priceBucket,
    durationBucket: criteria.durationBucket,
    dayPreset: criteria.dayPreset,
    groupSize: criteria.groupSize,
    city: criteria.city,
  };
}

const EMPTY_ADVANCED: AdvancedDraft = {
  priceBucket: null,
  durationBucket: null,
  dayPreset: null,
  groupSize: null,
  city: '',
};

interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Committed criteria — fixed while the sheet is open; the draft forks from it. */
  criteria: ExperienceCriteria;
  /** Lightweight full-catalogue projection for the live result count. */
  facets: readonly FilterableExperience[];
  /** Distinct operating cities (display casing). City section hides when ≤1. */
  cities: readonly string[];
  /** Commits the merged criteria to the URL and closes the sheet. */
  onApply: (next: ExperienceCriteria) => void;
}

function Section({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="border-sarat-black/8 flex flex-col gap-3 [border-top-width:0.5px] py-6 first:border-t-0 first:pt-0">
      <legend className="text-sarat-black float-none text-base font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Sheet body — mounted only while the sheet is open (the {@link Sheet}
 * unmounts its content on close), so the draft `useState` forks fresh from
 * the committed criteria on every open with no syncing effect. The footer
 * button previews the exact match count through the same `matchesCriteria`
 * predicate the server grid uses, so the number can't drift. "Show N"
 * commits once; closing without applying discards.
 */
function FilterSheetBody({
  criteria,
  facets,
  cities,
  onApply,
}: Pick<FilterSheetProps, 'criteria' | 'facets' | 'cities' | 'onApply'>) {
  const t = useTranslations('experiencesIndex');
  const [draft, setDraft] = useState<AdvancedDraft>(() => pickAdvanced(criteria));

  const merged: ExperienceCriteria = { ...criteria, ...draft };
  const count = facets.reduce((n, f) => (matchesCriteria(f, merged) ? n + 1 : n), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <Section legend={t('priceLegend')}>
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {PRICE_BUCKETS.map((bucket) => (
            <Pill
              key={bucket}
              selected={draft.priceBucket === bucket}
              onClick={() =>
                setDraft((d) => ({ ...d, priceBucket: d.priceBucket === bucket ? null : bucket }))
              }
            >
              <RiyalSymbol className="h-[0.85em] align-[-0.05em]" />
              {t(`price.${bucket}`)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section legend={t('durationLegend')}>
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {DURATION_BUCKETS.map((bucket) => (
            <Pill
              key={bucket}
              selected={draft.durationBucket === bucket}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  durationBucket: d.durationBucket === bucket ? null : bucket,
                }))
              }
            >
              {t(`duration.${bucket}`)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section legend={t('dayLegend')}>
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          <Pill
            selected={draft.dayPreset === null}
            onClick={() => setDraft((d) => ({ ...d, dayPreset: null }))}
          >
            {t('day.any')}
          </Pill>
          {DAY_PRESETS.map((preset) => (
            <Pill
              key={preset}
              selected={draft.dayPreset === preset}
              onClick={() =>
                setDraft((d) => ({ ...d, dayPreset: d.dayPreset === preset ? null : preset }))
              }
            >
              {t(`day.${preset}`)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section legend={t('groupLegend')}>
        <GuestStepper
          value={draft.groupSize}
          onChange={(next) => setDraft((d) => ({ ...d, groupSize: next }))}
        />
      </Section>

      {cities.length > 1 && (
        <Section legend={t('cityLegend')}>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            <Pill
              selected={draft.city === ''}
              onClick={() => setDraft((d) => ({ ...d, city: '' }))}
            >
              {t('cityAll')}
            </Pill>
            {cities.map((city) => {
              const value = city.toLowerCase();
              return (
                <Pill
                  key={city}
                  selected={draft.city === value}
                  onClick={() => setDraft((d) => ({ ...d, city: d.city === value ? '' : value }))}
                >
                  {city}
                </Pill>
              );
            })}
          </div>
        </Section>
      )}

      <div className="border-sarat-black/8 sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-4 [border-top-width:0.5px] bg-white px-4 pt-4">
        <button
          type="button"
          onClick={() => setDraft(EMPTY_ADVANCED)}
          className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center text-sm underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
        >
          {t('clearAll')}
        </button>
        <Button
          variant="premium"
          onClick={() => onApply(merged)}
          className={cn(count === 0 && 'opacity-70')}
        >
          {t('showResults', { count })}
        </Button>
      </div>
    </div>
  );
}

/**
 * Tier-2 "All filters" surface. Springs up as a bottom sheet (BRIEF §3).
 * All draft state lives in {@link FilterSheetBody}, which only mounts while
 * open, so each open starts from the committed criteria.
 */
export function FilterSheet({
  open,
  onOpenChange,
  criteria,
  facets,
  cities,
  onApply,
}: FilterSheetProps) {
  const t = useTranslations('experiencesIndex');
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title={t('filtersTitle')}>
      <FilterSheetBody criteria={criteria} facets={facets} cities={cities} onApply={onApply} />
    </Sheet>
  );
}
