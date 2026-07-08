'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import type { ExperienceCriteria } from '@/features/experiences/lib/search';

interface ActiveFiltersProps {
  criteria: ExperienceCriteria;
  /** Distinct cities (display casing) for resolving the city token label. */
  cities: readonly string[];
  /** Clears a single facet by patching the criteria. */
  onRemove: (patch: Partial<ExperienceCriteria>) => void;
}

interface Token {
  key: string;
  label: ReactNode;
  patch: Partial<ExperienceCriteria>;
}

/**
 * Removable tokens summarising the *advanced* facets in play (price,
 * duration, when, group, city). Category and Originals live in the always-
 * visible strip, so they're intentionally not repeated here. Each token
 * clears its own facet; the rail owns the global reset.
 */
export function ActiveFilters({ criteria, cities, onRemove }: ActiveFiltersProps) {
  const t = useTranslations('experiencesIndex');

  const tokens: Token[] = [];

  if (criteria.priceBucket) {
    tokens.push({
      key: 'price',
      label: (
        <>
          <RiyalSymbol className="h-[0.85em] align-[-0.05em]" />{' '}
          {t(`price.${criteria.priceBucket}`)}
        </>
      ),
      patch: { priceBucket: null },
    });
  }
  if (criteria.durationBucket) {
    tokens.push({
      key: 'duration',
      label: t(`duration.${criteria.durationBucket}`),
      patch: { durationBucket: null },
    });
  }
  if (criteria.dayPreset) {
    tokens.push({
      key: 'day',
      label: t(`day.${criteria.dayPreset}`),
      patch: { dayPreset: null },
    });
  }
  if (criteria.groupSize !== null) {
    tokens.push({
      key: 'group',
      label: t('groupToken', { count: criteria.groupSize }),
      patch: { groupSize: null },
    });
  }
  if (criteria.city) {
    const display = cities.find((c) => c.toLowerCase() === criteria.city) ?? criteria.city;
    tokens.push({ key: 'city', label: display, patch: { city: '' } });
  }

  if (tokens.length === 0) return null;

  return (
    <ul aria-label={t('activeFiltersLabel')} className="flex flex-wrap items-center gap-2">
      {tokens.map((token) => (
        <li key={token.key}>
          <button
            type="button"
            onClick={() => onRemove(token.patch)}
            aria-label={`${t('removeFilter')}: ${typeof token.label === 'string' ? token.label : token.key}`}
            className="border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 inline-flex h-11 items-center gap-2 rounded-full [border-width:0.5px] ps-4 pe-3 text-sm transition-colors duration-200"
          >
            <span className="inline-flex items-center gap-1">{token.label}</span>
            <X className="text-sarat-black-600 size-4 shrink-0" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
