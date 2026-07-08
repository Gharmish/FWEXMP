'use client';

import {
  Castle,
  Coffee,
  Flower2,
  Leaf,
  Mountain,
  Users,
  Venus,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { HoverLift } from '@/components/ui/motion';
import type { CategoryMeta } from '@/features/experiences/types';

/**
 * Category tiles — the homepage's discovery row and its one moment of
 * colour play. Minimal white hairline cards (no large tinted fills,
 * premium redesign 2026-06): a small 100-tint icon disc in the
 * category's immutable brand colour (BRIEF §3) beside the label.
 * Deep-links to the filtered catalogue.
 *
 * The row is a single-line marquee: it drifts steadily so every category
 * comes into view, and pauses the moment the guest scrolls or swipes it
 * (in either direction), resuming after they stop. Honours reduced-motion
 * by rendering a plain, static scroll strip with no auto-drift.
 */
export interface CategoryTilesProps {
  locale: Locale;
  categories: readonly CategoryMeta[];
}

// Literal classes so Tailwind v4 detects them (same pattern as CATEGORY_DOT).
const TILE_DISC: Record<Category, string> = {
  nature: 'bg-juniper-green-100 text-juniper-green-800',
  heritage: 'bg-al-qatt-red-100 text-al-qatt-red-800',
  food: 'bg-saffron-gold-100 text-saffron-gold-800',
  wellness: 'bg-wadi-mint-100 text-wadi-mint-800',
  adventure: 'bg-soudah-sunset-100 text-soudah-sunset-800',
  family: 'bg-sarawat-blue-100 text-sarawat-blue-800',
  women_only: 'bg-tihama-coral-100 text-tihama-coral-800',
};

// Castle for heritage: Aseer's fortress villages (Rijal Almaa, Habala) —
// not Landmark's Greek temple, which reads foreign here.
const TILE_ICON: Record<Category, LucideIcon> = {
  nature: Leaf,
  heritage: Castle,
  food: Coffee,
  wellness: Flower2,
  adventure: Mountain,
  family: Users,
  women_only: Venus,
};

/** Auto-drift speed, px per animation frame (~24px/s at 60fps). */
const DRIFT_SPEED = 0.4;
/** Idle delay before the marquee resumes after the guest stops scrolling. */
const RESUME_DELAY_MS = 1800;

function CategoryTile({
  category,
  locale,
  duplicate = false,
}: {
  category: CategoryMeta;
  locale: Locale;
  duplicate?: boolean;
}) {
  const Icon = TILE_ICON[category.key];
  return (
    <HoverLift className="shrink-0">
      <Link
        href={`/experiences?category=${category.key}`}
        // The duplicated half is a visual loop only — keep it out of the tab
        // order and the a11y tree so screen readers see each category once.
        aria-hidden={duplicate || undefined}
        tabIndex={duplicate ? -1 : undefined}
        className="rounded-card border-sarat-black/8 hover:border-sarat-black/20 flex min-h-11 items-center gap-3 [border-width:0.5px] px-4 py-3 transition-colors duration-200"
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TILE_DISC[category.key]}`}
        >
          <Icon className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="text-sm font-medium whitespace-nowrap">
          {locale === 'ar' ? category.labelAr : category.labelEn}
        </span>
      </Link>
    </HoverLift>
  );
}

export function CategoryTiles({ locale, categories }: CategoryTilesProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const el = scrollerRef.current;
    if (!el) return;

    // In RTL the visual drift runs the other way; scrollLeft goes negative
    // from 0 (modern spec, all evergreen browsers).
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;

    let raf = 0;
    let paused = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      // Content is rendered twice; one full loop is half the scroll width.
      const half = el.scrollWidth / 2;
      if (half > 0) {
        if (!paused) el.scrollLeft += DRIFT_SPEED * dir;
        // Wrap seamlessly at either boundary so both the auto-drift and any
        // manual overscroll loop without hitting a dead end.
        if (el.scrollLeft >= half) el.scrollLeft -= half;
        else if (el.scrollLeft <= -half) el.scrollLeft += half;
      }
      raf = requestAnimationFrame(step);
    };

    const pause = () => {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        paused = false;
      }, RESUME_DELAY_MS);
    };

    // Any deliberate scroll gesture — swipe, trackpad, scrollbar drag — pauses
    // the drift. We listen to the gestures rather than the `scroll` event so
    // our own scrollLeft writes don't pause it every frame.
    el.addEventListener('pointerdown', pause);
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('wheel', pause, { passive: true });

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer) clearTimeout(resumeTimer);
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('wheel', pause);
    };
  }, [reduceMotion]);

  // Rendered twice for a seamless loop; the second pass is hidden from a11y.
  const tiles = [false, true].map((duplicate) =>
    categories.map((c) => (
      <CategoryTile
        key={`${duplicate ? 'dup-' : ''}${c.key}`}
        category={c}
        locale={locale}
        duplicate={duplicate}
      />
    )),
  );

  return (
    <div
      ref={scrollerRef}
      className="flex [scrollbar-width:none] gap-3 overflow-x-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {tiles}
    </div>
  );
}
