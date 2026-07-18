'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { SPRING } from '@/components/ui/motion';
import { PhotoCarousel } from '@/components/ui/photo-carousel';

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
  locale: Locale;
  copy: PhotoGalleryCopy;
}

/** Gallery images shown in the desktop mosaic beside the hero. */
const MAX_SIDE = 4;

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
 *
 * Restraint-first (BRIEF §3): hairline affordances, no shadows, spring
 * motion that degrades to a static fade under reduced-motion.
 */
export function PhotoGallery({ heroImage, images, alt, locale, copy }: PhotoGalleryProps) {
  const reduce = useReducedMotion();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The tile that opened the lightbox — focus returns there on close
  // (aria-modal hides the page; without trap + restore, Tab walks
  // content screen readers can't perceive).
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

  // Initial focus: the close button, once per open (not on prev/next).
  const wasOpen = useRef(false);
  useEffect(() => {
    const isOpen = openAt !== null;
    if (isOpen && !wasOpen.current) {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
    wasOpen.current = isOpen;
  }, [openAt]);

  // Physical arrow keys follow the on-screen (mirrored) chevrons in RTL —
  // same convention as the booking calendar.
  const arrowFactor = locale === 'ar' ? -1 : 1;

  // Keyboard nav + focus trap + background scroll lock while open.
  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(arrowFactor);
      else if (e.key === 'ArrowLeft') step(-arrowFactor);
      else if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openAt, close, step, arrowFactor]);

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

  return (
    <>
      {/* No hero yet: tonal placeholder mirrors the catalog card so
          photo-less listings stay clean rather than showing a void. */}
      {!heroImage && (
        <div className="bg-mist-deep rounded-image relative mt-8 aspect-[16/9] w-full overflow-hidden" />
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
              aria-label={copy.open}
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
                    aria-label={copy.open}
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

      {/* Lightbox */}
      {openAt !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={copy.open}
          className="bg-sarat-black/95 fixed inset-0 z-50 flex flex-col"
        >
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
            className="relative min-h-0 flex-1"
          >
            <Image
              src={lightbox[openAt]}
              alt={`${alt} — ${formatInteger(openAt + 1, locale)}/${formatInteger(total, locale)}`}
              fill
              sizes="100vw"
              className="object-contain"
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
        </div>
      )}
    </>
  );
}
