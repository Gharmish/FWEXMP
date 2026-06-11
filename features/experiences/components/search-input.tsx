'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { parseSearchParams, toSearchParams } from '@/features/experiences/lib/search';

const DEBOUNCE_MS = 250;

/**
 * Debounced search box that writes ?q= into the URL. The local input
 * state is the source of truth while typing; once debounce settles we
 * push the canonical lowercase query to the URL and let the server
 * re-render the grid. Submitting the form (Enter) skips the debounce.
 */
export function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('experiencesIndex.search');
  const [isPending, startTransition] = useTransition();

  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else params[key] = [existing, value];
  });
  const initialCriteria = parseSearchParams(params);
  const [value, setValue] = useState(initialCriteria.q);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: string) {
    const criteria = parseSearchParams(params);
    const qs = toSearchParams({ ...criteria, q: next.trim().toLowerCase() }).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    push(value);
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValue('');
    push('');
  }

  // Tear down any pending timer on unmount to avoid stray router.replace.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={cn(
        'rounded-input border-sarat-black/20 relative flex h-11 w-full items-center gap-3 [border-width:0.5px] bg-white ps-4 pe-2',
        isPending && 'opacity-70 transition-opacity',
      )}
    >
      <Search className="text-sarat-black-600 size-4 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        className="placeholder:text-sarat-black-600 text-sarat-black h-full w-full bg-transparent text-base focus:outline-none"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={t('clear')}
          className="text-sarat-black-600 hover:text-sarat-black rounded-button inline-flex size-11 shrink-0 items-center justify-center transition-opacity duration-200 hover:opacity-60"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
