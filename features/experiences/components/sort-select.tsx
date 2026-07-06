'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { Select } from '@base-ui/react/select';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';
import {
  DEFAULT_SORT,
  SORT_KEYS,
  parseSearchParams,
  toSearchParams,
  type SortKey,
} from '@/features/experiences/lib/search';

/**
 * URL-driven sort dropdown on Base UI Select — branded popup (hairline,
 * rounded-input, --shadow-overlay) that opens on the one spring. The
 * selected value lives in the URL so SSR + back/forward navigation stay
 * correct; keyboard and screen-reader behavior come from Base UI.
 */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const t = useTranslations('experiencesIndex.sort');

  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else params[key] = [existing, value];
  });
  const criteria = parseSearchParams(params);

  function onValueChange(next: SortKey) {
    const qs = toSearchParams({ ...criteria, sort: next }).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <Select.Root
      items={SORT_KEYS.map((key) => ({ value: key, label: t(key) }))}
      value={criteria.sort}
      onValueChange={(value) => onValueChange(value as SortKey)}
      open={open}
      onOpenChange={setOpen}
    >
      <Select.Trigger
        aria-label={t('label')}
        className={cn(
          'rounded-input border-sarat-black/20 text-sarat-black inline-flex h-11 cursor-pointer items-center gap-2 [border-width:0.5px] bg-white ps-4 pe-3 text-sm select-none',
          isPending && 'opacity-70 transition-opacity',
        )}
      >
        <span className="text-sarat-black-600">{t('label')}</span>
        <span className="font-medium">
          <Select.Value />
        </span>
        <Select.Icon
          render={
            <ChevronDown
              className={cn(
                'text-sarat-black-600 size-4 transition-transform duration-200',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          }
        />
      </Select.Trigger>
      <AnimatePresence>
        {open ? (
          <Select.Portal>
            <Select.Positioner sideOffset={4} align="end" className="z-[60]">
              <Select.Popup
                render={
                  <motion.div
                    className="rounded-input border-sarat-black/8 min-w-[--anchor-width] [border-width:0.5px] bg-white py-1 shadow-[var(--shadow-overlay)]"
                    initial={reduce ? false : { opacity: 0, scale: 0.97, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={SPRING}
                  />
                }
              >
                {SORT_KEYS.map((key) => (
                  <Select.Item
                    key={key}
                    value={key}
                    className="data-[highlighted]:bg-mist-deep flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm outline-none select-none"
                  >
                    <Select.ItemIndicator
                      render={<Check className="size-4 shrink-0" aria-hidden />}
                    />
                    <span
                      className={cn(
                        'inline-block',
                        // Reserve the indicator slot so labels align.
                        criteria.sort !== key && 'ms-6',
                      )}
                    >
                      <Select.ItemText>{t(key)}</Select.ItemText>
                    </span>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        ) : null}
      </AnimatePresence>
      {/* hidden default keeps the URL clean when the user picks it explicitly */}
      <span className="sr-only">{t(DEFAULT_SORT)}</span>
    </Select.Root>
  );
}
