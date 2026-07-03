'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export interface PhotoCarouselCopy {
  prev: string;
  next: string;
  /** Dot/slide aria-label template with an `{n}` placeholder (1-based). */
  goTo: string;
}

export interface PhotoCarouselProps {
  /** Hero-first list of image URLs. Must be non-empty. */
  images: string[];
  alt: string;
  locale: Locale;
  /** next/image `sizes` for each slide. */
  sizes: string;
  /** Aspect-ratio utility for the frame, e.g. `aspect-[16/9]`. */
  aspectClassName: string;
  /** Corner rounding for the track (omit inside an already-clipped card). */
  roundedClassName?: string;
  /** Eager-load the first slide (LCP). */
  priority?: boolean;
  copy: PhotoCarouselCopy;
  /**
   * Tap target for each slide. `href` makes a slide navigate (catalog card);
   * `onSlideClick` runs a handler (detail-page lightbox). Either renders an
   * inset overlay above the image, so a horizontal swipe still scrolls the
   * track and only a tap activates. Mutually exclusive.
   */
  href?: string;
  onSlideClick?: (index: number) => void;
  className?: string;
}

/**
 * Horizontal, swipeable photo carousel (BRIEF §3 — restraint + spring motion).
 * Native scroll-snap drives the swipe so touch feels right and the track stays
 * accessible; an IntersectionObserver tracks the centered slide, which keeps the
 * active state correct in both LTR and RTL without any scrollLeft sign math.
 * Arrows are a desktop hover affordance; dots work on every viewport. All
 * controls stop event propagation so the carousel can live inside a clickable
 * card without hijacking navigation.
 */
export function PhotoCarousel({
  images,
  alt,
  locale,
  sizes,
  aspectClassName,
  roundedClassName,
  priority,
  copy,
  href,
  onSlideClick,
  className,
}: PhotoCarouselProps) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const count = images.length;

  // Mark the centered slide active. IntersectionObserver is direction-agnostic,
  // so this behaves identically in LTR and RTL.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = slideRefs.current.indexOf(e.target as HTMLElement);
            if (i !== -1) setActive(i);
          }
        }
      },
      { root: track, threshold: 0.6 },
    );
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [count]);

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(count - 1, i));
      slideRefs.current[clamped]?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    },
    [count, reduce],
  );

  // Controls may sit inside a clickable card/link — never let them navigate.
  const halt = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const label = (i: number) => copy.goTo.replace('{n}', formatInteger(i + 1, locale));

  return (
    <div className={cn('group/carousel relative w-full', aspectClassName, className)}>
      <div
        ref={trackRef}
        className={cn(
          'flex size-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto scroll-smooth [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          roundedClassName,
        )}
      >
        {images.map((src, i) => (
          <div
            key={src}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="relative h-full w-full shrink-0 snap-center"
          >
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              className="object-cover"
              priority={priority && i === 0}
            />
            {/* Inset tap layer — above the image, below the controls (z-10).
                A swipe scrolls the track and suppresses the tap, so this never
                fights the gesture. */}
            {href ? (
              <Link
                href={href}
                aria-label={label(i)}
                className="focus-visible:ring-saffron-gold absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              />
            ) : onSlideClick ? (
              <button
                type="button"
                aria-label={label(i)}
                onClick={(e) => {
                  halt(e);
                  onSlideClick(i);
                }}
                className="focus-visible:ring-saffron-gold absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset"
              />
            ) : null}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          {active > 0 && (
            <button
              type="button"
              aria-label={copy.prev}
              onClick={(e) => {
                halt(e);
                goTo(active - 1);
              }}
              className="text-sarat-black border-sarat-black/10 focus-visible:ring-saffron-gold absolute start-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full [border-width:0.5px] bg-white/90 p-2 opacity-0 transition-opacity duration-200 outline-none group-hover/carousel:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 sm:flex"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          )}
          {active < count - 1 && (
            <button
              type="button"
              aria-label={copy.next}
              onClick={(e) => {
                halt(e);
                goTo(active + 1);
              }}
              className="text-sarat-black border-sarat-black/10 focus-visible:ring-saffron-gold absolute end-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full [border-width:0.5px] bg-white/90 p-2 opacity-0 transition-opacity duration-200 outline-none group-hover/carousel:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 sm:flex"
            >
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          )}

          <div className="absolute inset-x-0 bottom-1 z-10 flex items-center justify-center">
            {images.map((src, i) => (
              // 24px hit area around a 6px visual dot (WCAG 2.5.8). A full
              // 44px strip would blanket the photo's bottom edge and steal
              // swipe/tap-to-open gestures — same geometry trade-off as the
              // booking calendar's day cells.
              <button
                key={src}
                type="button"
                aria-label={label(i)}
                aria-current={i === active}
                onClick={(e) => {
                  halt(e);
                  goTo(i);
                }}
                className="flex size-6 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    'ring-sarat-black/15 size-1.5 rounded-full ring-1 transition-colors duration-200',
                    i === active ? 'bg-white' : 'bg-white/55 hover:bg-white/80',
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
