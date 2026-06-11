'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { SPRING } from '@/components/ui/motion';

export interface PhotoGalleryCopy {
  /** Accessible label for opening the lightbox (e.g. "View photos"). */
  open: string;
  /** Noun for the photo count, e.g. "photos" — the number is prepended. */
  count: string;
  close: string;
  prev: string;
  next: string;
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

/** Thumbnails shown inline before the grid collapses into a "+N" tile. */
const MAX_THUMBS = 6;

/**
 * Experience photo gallery: the LCP hero plus a thumbnail grid, both
 * opening a full-screen lightbox. The hero is cropped to 16:9 for a clean
 * catalog-consistent frame, but the lightbox shows every photo with
 * `object-contain` on a dark surface — so portrait and landscape shots
 * both display in full, which is exactly where mixed orientation belongs.
 *
 * Restraint-first (BRIEF §3): hairline affordances, no shadows, spring
 * motion that degrades to a static fade under reduced-motion.
 */
export function PhotoGallery({ heroImage, images, alt, locale, copy }: PhotoGalleryProps) {
  const reduce = useReducedMotion();
  const [openAt, setOpenAt] = useState<number | null>(null);

  // The lightbox sequence is hero-first, then the gallery images. Thumbnail
  // index i therefore maps to lightbox index i (+1 when a hero leads).
  const lightbox = heroImage ? [heroImage, ...images] : images;
  const heroOffset = heroImage ? 1 : 0;
  const total = lightbox.length;
  const hasGallery = images.length > 0;

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) => setOpenAt((i) => (i === null ? i : (i + delta + total) % total)),
    [total],
  );

  // Keyboard nav + background scroll lock while the lightbox is open.
  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openAt, close, step]);

  const visibleThumbs = images.slice(0, MAX_THUMBS);
  const overflow = images.length - visibleThumbs.length;

  return (
    <>
      {/* Hero — clickable when there's anything to open; tonal placeholder
          mirrors the catalog card so photo-less listings stay clean. */}
      <div
        className={cn(
          'rounded-image relative mt-8 aspect-[16/9] w-full overflow-hidden',
          !heroImage && 'bg-mist-deep',
        )}
      >
        {heroImage && (
          <>
            <Image
              src={heroImage}
              alt={alt}
              fill
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="object-cover"
              priority
            />
            <button
              type="button"
              aria-label={copy.open}
              onClick={() => setOpenAt(0)}
              className="group focus-visible:ring-saffron-gold absolute inset-0 cursor-pointer outline-none focus-visible:ring-2"
            >
              {total > 1 && (
                <span className="text-sarat-black border-sarat-black/10 absolute end-4 bottom-4 inline-flex items-center gap-2 rounded-full [border-width:0.5px] bg-white/90 px-4 py-2 text-sm font-medium transition-transform duration-200 group-hover:-translate-y-px">
                  <Images className="size-4 shrink-0" aria-hidden />
                  {formatInteger(total, locale)} {copy.count}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Thumbnail grid — only when the host added gallery photos. */}
      {hasGallery && (
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {visibleThumbs.map((src, i) => {
            const isLast = i === visibleThumbs.length - 1 && overflow > 0;
            return (
              <button
                key={src}
                type="button"
                aria-label={copy.open}
                onClick={() => setOpenAt(heroOffset + i)}
                className="rounded-image bg-sarat-black/5 focus-visible:ring-saffron-gold relative aspect-square overflow-hidden transition-transform duration-200 outline-none hover:-translate-y-px focus-visible:ring-2"
              >
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(min-width: 640px) 16vw, 33vw"
                  className="object-cover"
                />
                {isLast && (
                  <span className="bg-sarat-black/55 absolute inset-0 flex items-center justify-center text-lg font-medium text-white">
                    +{formatInteger(overflow + 1, locale)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {openAt !== null && (
        <div
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
              alt={alt}
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
