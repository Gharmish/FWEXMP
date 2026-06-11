'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SORT,
  SORT_KEYS,
  parseSearchParams,
  toSearchParams,
  type SortKey,
} from '@/features/experiences/lib/search';

/**
 * URL-driven sort dropdown. Native <select> for accessibility +
 * minimal client weight; custom chevron + hairline border to match
 * the rest of the catalog UI. The selected value lives in the URL
 * so SSR + back/forward navigation stay correct.
 */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('experiencesIndex.sort');

  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else params[key] = [existing, value];
  });
  const criteria = parseSearchParams(params);

  function onChange(next: SortKey) {
    const qs = toSearchParams({ ...criteria, sort: next }).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <label
      className={cn(
        'rounded-input border-sarat-black/20 text-sarat-black relative inline-flex h-11 items-center gap-2 [border-width:0.5px] bg-white ps-4 pe-3 text-sm',
        isPending && 'opacity-70 transition-opacity',
      )}
    >
      <span className="text-sarat-black-600">{t('label')}</span>
      <select
        value={criteria.sort}
        onChange={(event) => onChange(event.target.value as SortKey)}
        className="text-sarat-black -mx-2 cursor-pointer appearance-none bg-transparent px-2 pe-6 text-sm font-medium focus:outline-none"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(key)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="text-sarat-black-600 pointer-events-none absolute end-3 size-4"
        aria-hidden
      />
      {/* hidden default keeps the URL clean when the user picks it explicitly */}
      <span className="sr-only">{t(DEFAULT_SORT)}</span>
    </label>
  );
}
