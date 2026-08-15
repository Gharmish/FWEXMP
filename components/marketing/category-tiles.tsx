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
import { categoryUrlSlug } from '@/features/experiences/lib/category-landing';

/**
 * Category tiles — the homepage's discovery row and its one moment of
 * colour play. Minimal white hairline cards (no large tinted fills,
 * premium redesign 2026-06): a small 100-tint icon disc in the
 * category's immutable brand colour (BRIEF §3) beside the label.
 * Deep-links to the filtered catalogue.
 *
 * The row is a single-line marquee: it drifts steadily so every category
 * comes into view, and stops for good the moment the guest engages it —
 * swipe, wheel, or keyboard focus (WCAG 2.2.2: a stop is a stop, not a
 * pause that snatches the row back). Honours reduced-motion by rendering
 * a plain, static scroll strip with no auto-drift.
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
        // The category LANDING page (crawlable, self-canonical), not the
        // query-string filter — this link is the main internal-linking
        // path that lets those pages rank (2026-08-15 marketing audit).
        href={`/experiences/${categoryUrlSlug(category.key)}`}
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
    // Once the guest touches the row the drift stops for good — WCAG
    // 2.2.2 needs a real stop mechanism, and an auto-resume snatches the
    // row back from whoever is reading it (the earlier 1.8s resume also
    // slid tiles away under keyboard focus, which never paused it at all).
    let stopped = false;
    // Track the position as a float. Mobile browsers (notably iOS Safari)
    // round `scrollLeft` to an integer, so reading it back each frame and
    // adding a sub-pixel step would floor away the drift and never move.
    // Accumulating here keeps the sub-pixel step and only writes to the DOM.
    let pos = el.scrollLeft;

    const step = () => {
      // Content is rendered twice; one full loop is half the scroll width.
      const half = el.scrollWidth / 2;
      if (half > 0) {
        pos += DRIFT_SPEED * dir;
        // Wrap seamlessly at either boundary so the auto-drift never hits
        // a dead end.
        if (pos >= half) pos -= half;
        else if (pos <= -half) pos += half;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (stopped || raf) return;
      pos = el.scrollLeft;
      raf = requestAnimationFrame(step);
    };
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const stop = () => {
      stopped = true;
      halt();
    };

    // Any deliberate engagement — swipe, trackpad, scrollbar drag, or
    // keyboard focus landing on a tile — stops the drift permanently.
    // Gesture listeners rather than `scroll` so our own scrollLeft writes
    // don't trip it every frame.
    el.addEventListener('pointerdown', stop);
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('focusin', stop);

    // The rAF loop is main-thread work on every frame for the lifetime of
    // the page — only run it while the row is actually on screen.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) start();
      else halt();
    });
    observer.observe(el);

    return () => {
      halt();
      observer.disconnect();
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('focusin', stop);
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
