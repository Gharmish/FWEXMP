'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Castle,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Flower2,
  Images,
  Leaf,
  Mountain,
  Users,
  Venus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { SPRING } from '@/components/ui/motion';
import { PhotoCarousel } from '@/components/ui/photo-carousel';
import type { Category } from '@/features/experiences/types';

export interface PhotoGalleryCopy {
  /** Accessible label for opening the lightbox (e.g. "View photos"). */
  open: string;
  /** Noun for the photo count, e.g. "photos" — the number is prepended. */
  count: string;
  close: string;
  prev: string;
  next: string;
  /** Slide/dot aria-label template with an `{n}` placeholder (1-based). */
  goTo: string;
}

export interface PhotoGalleryProps {
  /** Hero image URL, or null when the photography session hasn't landed. */
  heroImage: string | null;
  /** Gallery images shown after the hero (BRIEF §3 — host's extra crops). */
  images: string[];
  /** Shared alt text (the experience title). */
  alt: string;
  /** Drives the tonal placeholder when no photo exists yet. */
  category: Category;
  locale: Locale;
  copy: PhotoGalleryCopy;
}

/** Gallery images shown in the desktop mosaic beside the hero. */
const MAX_SIDE = 4;

/**
 * Tonal placeholder background per category. Mirrors CATEGORY_PLACEHOLDER
 * in features/experiences/components/experience-card.tsx (not exported) —
 * keep the two maps in sync so the pre-shoot detail hero matches the card
 * the guest just tapped.
 */
const CATEGORY_PLACEHOLDER: Record<Category, string> = {
  nature: 'bg-juniper-green/15',
  heritage: 'bg-al-qatt-red/15',
  food: 'bg-saffron-gold/20',
  wellness: 'bg-wadi-mint/25',
  adventure: 'bg-soudah-sunset/15',
  family: 'bg-sarawat-blue/15',
  women_only: 'bg-tihama-coral/25',
};

/**
 * Category icons — same taxonomy as CATEGORY_ICON in category-strip.tsx
 * and TILE_ICON in components/marketing/category-tiles.tsx (each surface
 * holds its own copy by convention).
 */
const CATEGORY_ICON: Record<Category, LucideIcon> = {
  nature: Leaf,
  heritage: Castle,
  food: Coffee,
  wellness: Flower2,
  adventure: Mountain,
  family: Users,
  women_only: Venus,
};

/** Minimum horizontal travel (px) before a lightbox pointer-drag counts as a swipe. */
const SWIPE_THRESHOLD = 48;

/**
 * Grid spans for the right-hand mosaic tiles, by how many gallery photos
 * sit beside the hero. The right column is a fixed 2×2 grid; the tiles
 * grow to fill it so 1, 2, 3, or 4 photos all read as a deliberate
 * composition with no empty cells.
 */
function sideSpan(index: number, count: number): string {
  if (count === 1) return 'col-span-2 row-span-2';
  if (count === 2) return 'col-span-2 row-span-1';
  if (count === 3) return index === 0 ? 'col-span-2 row-span-1' : 'col-span-1 row-span-1';
  return 'col-span-1 row-span-1';
}

/**
 * Experience photo gallery. On wide screens it leads with an Airbnb-style
 * mosaic — one large hero beside a 2×2 grid of crops — so the photography
 * fills the frame and sells the experience. On mobile (and for listings
 * with no gallery yet) it falls back to a single tall 3:2 hero. Every tile
 * opens a full-screen lightbox that shows each photo with `object-contain`
 * on a dark surface, so portrait and landscape shots both display in full.
 * The lightbox rides the shared Base UI Dialog primitives (focus trap,
 * scroll lock, Escape, aria wiring) like every other overlay in the app.
 *
 * Restraint-first (BRIEF §3): hairline affordances, no shadows, spring
 * motion that degrades to a static fade under reduced-motion.
 */
export function PhotoGallery({
  heroImage,
  images,
  alt,
  category,
  locale,
  copy,
}: PhotoGalleryProps) {
  const reduce = useReducedMotion();
  const [openAt, setOpenAt] = useState<number | null>(null);
  // The tile that opened the lightbox — focus returns there on close so
  // keyboard users land back where they left the page.
  const openerRef = useRef<HTMLElement | null>(null);

  // The lightbox sequence is hero-first, then the gallery images. Tile
  // index i therefore maps to lightbox index i (+1 when a hero leads).
  const lightbox = heroImage ? [heroImage, ...images] : images;
  const total = lightbox.length;
  const hasGallery = heroImage !== null && images.length > 0;

  const openLightbox = useCallback((index: number) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenAt(index);
  }, []);
  const close = useCallback(() => {
    setOpenAt(null);
    openerRef.current?.focus();
  }, []);
  const step = useCallback(
    (delta: number) => setOpenAt((i) => (i === null ? i : (i + delta + total) % total)),
    [total],
  );

  // Physical arrow keys follow the on-screen (mirrored) chevrons in RTL —
  // same convention as the booking calendar. Escape/Tab are Base UI's job.
  const arrowFactor = locale === 'ar' ? -1 : 1;
  const onLightboxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(arrowFactor);
      else if (e.key === 'ArrowLeft') step(-arrowFactor);
    },
    [step, arrowFactor],
  );

  // Horizontal swipe navigation on touch: a plain pointer-delta check (no
  // dependency) — the vertical guard keeps accidental scroll-ish drags inert.
  const swipeStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const onSwipeStart = useCallback((e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }, []);
  const onSwipeEnd = useCallback(
    (e: React.PointerEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || start.id !== e.pointerId || total < 2) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      // Content follows the finger: a start-ward swipe advances, mirrored
      // in RTL exactly like the arrow keys.
      step(dx < 0 ? arrowFactor : -arrowFactor);
    },
    [step, total, arrowFactor],
  );

  // Per-tile lightbox-position label ("Go to photo {n}") — every tile used
  // to announce an identical "View photos". Same interpolation contract as
  // PhotoCarousel: the `{n}` literal survives the server→client boundary.
  const tileLabel = (position: number) => copy.goTo.replace('{n}', formatInteger(position, locale));

  const sideImages = images.slice(0, MAX_SIDE);
  // Photos that don't fit in the mosaic — surfaced as a "+N" overlay so the
  // guest knows there's more behind the "view all" affordance.
  const remaining = images.length - sideImages.length;

  // The count pill / "view all" affordance. Always offered when there's more
  // than one photo, so the lightbox is discoverable on every viewport.
  const countPill = total > 1 && (
    <span className="text-sarat-black border-sarat-black/10 pointer-events-none absolute end-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-full [border-width:0.5px] bg-white/90 px-4 py-2 text-sm font-medium transition-transform duration-200 group-hover:-translate-y-px">
      <Images className="size-4 shrink-0" aria-hidden />
      {formatInteger(total, locale)} {copy.count}
    </span>
  );

  const PlaceholderIcon = CATEGORY_ICON[category];

  return (
    <>
      {/* No hero yet: the catalog card's category tint (not a bare grey
          slab), at a shallower aspect so the header stays near the fold,
          with the category icon as a quiet centre mark. */}
      {!heroImage && (
        <div
          className={cn(
            'rounded-image relative mt-8 flex aspect-[21/9] w-full items-center justify-center overflow-hidden',
            CATEGORY_PLACEHOLDER[category],
          )}
        >
          <PlaceholderIcon className="text-sarat-black/15 size-16" strokeWidth={1.5} aria-hidden />
        </div>
      )}

      {/* Hero only (no gallery): a single 16:9 frame — the exact aspect the
          host framed in the crop tool, so the hero shows uncropped. */}
      {heroImage && !hasGallery && (
        <div className="rounded-image relative mt-8 aspect-[16/9] w-full overflow-hidden">
          <button
            type="button"
            aria-label={copy.open}
            onClick={() => openLightbox(0)}
            className="group absolute inset-0 z-10 cursor-pointer outline-none"
          >
            {countPill}
          </button>
          <Image
            src={heroImage}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Hero + gallery: a swipeable carousel on mobile, a 1-large-plus-2×2
          mosaic on wide screens. */}
      {heroImage && hasGallery && (
        <div className="mt-8">
          {/* Mobile: swipe through every photo inline; a tap opens the lightbox. */}
          <PhotoCarousel
            images={lightbox}
            alt={alt}
            locale={locale}
            sizes="(min-width: 640px) 1px, 100vw"
            aspectClassName="aspect-[16/9]"
            roundedClassName="rounded-image"
            priority
            copy={{ prev: copy.prev, next: copy.next, goTo: copy.goTo }}
            onSlideClick={(i) => openLightbox(i)}
            // No auto-advance: WCAG 2.2.2 (Level A) — moving content
            // lasting >5s needs a pause/stop control, and this carousel
            // has none. `experience-card.tsx` already passes 0 for the
            // same reason; the detail hero inherited PhotoCarousel's 5s
            // default and cycled forever (2026-07-28 fifth audit).
            // Hover/touch pause is not a conforming mechanism.
            autoAdvanceMs={0}
            className="sm:hidden"
          />

          {/* Desktop: mosaic. The hero tile is exactly 16:9 — the frame the
              host chose in the crop tool shows uncropped — and the 2×2 side
              column stretches to match its height. Side tiles are collage
              crops. */}
          <div className="group relative hidden sm:grid sm:grid-cols-2 sm:gap-2">
            {countPill}

            {/* Hero tile */}
            <button
              type="button"
              aria-label={tileLabel(1)}
              onClick={() => openLightbox(0)}
              className="rounded-image relative block aspect-[16/9] w-full cursor-pointer overflow-hidden outline-none"
            >
              <Image
                src={heroImage}
                alt={alt}
                fill
                sizes="(min-width: 1024px) 560px, (min-width: 640px) 50vw, 1px"
                className="object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                priority
              />
            </button>

            {/* Side mosaic */}
            <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
              {sideImages.map((src, i) => {
                const isLast = i === sideImages.length - 1 && remaining > 0;
                return (
                  <button
                    key={src}
                    type="button"
                    aria-label={tileLabel(2 + i)}
                    onClick={() => openLightbox(1 + i)}
                    className={cn(
                      'rounded-image bg-sarat-black/5 relative overflow-hidden outline-none',
                      sideSpan(i, sideImages.length),
                    )}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 280px, (min-width: 640px) 25vw, 1px"
                      className="object-cover"
                    />
                    {isLast && (
                      <span className="bg-sarat-black/55 absolute inset-0 flex items-center justify-center text-lg font-medium text-white">
                        +{formatInteger(remaining + 1, locale)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — Base UI dialog (focus trap, scroll lock, Escape, aria)
          with the dark full-screen surface. The popup itself is the keydown
          target for the RTL-mirrored arrow-key navigation. */}
      <BaseDialog.Root
        open={openAt !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="bg-sarat-black/95 fixed inset-0 z-50" />
          <BaseDialog.Popup
            aria-label={copy.open}
            onKeyDown={onLightboxKeyDown}
            className="fixed inset-0 z-50 flex flex-col outline-none"
          >
            {openAt !== null && (
              <>
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm text-white/80 tabular-nums">
                    {formatInteger(openAt + 1, locale)} / {formatInteger(total, locale)}
                  </span>
                  <IconButton
                    aria-label={copy.close}
                    onClick={close}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <X aria-hidden />
                  </IconButton>
                </div>

                <motion.div
                  key={openAt}
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING}
                  onPointerDown={onSwipeStart}
                  onPointerUp={onSwipeEnd}
                  // touch-none hands the horizontal drag to the swipe handler
                  // (the page behind is scroll-locked anyway).
                  className="relative min-h-0 flex-1 touch-none select-none"
                >
                  <Image
                    src={lightbox[openAt]}
                    alt={`${alt} — ${formatInteger(openAt + 1, locale)}/${formatInteger(total, locale)}`}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    // Native image drag would swallow the pointerup the swipe
                    // handler needs.
                    draggable={false}
                    priority
                  />
                </motion.div>

                {total > 1 && (
                  <div className="flex items-center justify-center gap-4 p-4">
                    <IconButton
                      aria-label={copy.prev}
                      onClick={() => step(-1)}
                      className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                    >
                      <ChevronLeft className="rtl:rotate-180" aria-hidden />
                    </IconButton>
                    <IconButton
                      aria-label={copy.next}
                      onClick={() => step(1)}
                      className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                    >
                      <ChevronRight className="rtl:rotate-180" aria-hidden />
                    </IconButton>
                  </div>
                )}
              </>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </>
  );
}
