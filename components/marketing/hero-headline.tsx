'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';
import type { Category } from '@/lib/colors';

/**
 * Hero headline: the word-by-word cascade of RiseInWords, with one slot
 * that rotates through the enabled categories in their immutable brand
 * tones (BRIEF §3) — one full cycle, then it settles and stays still.
 * The slot is FIXED at the widest measured word, so rotation never
 * reflows the sentence (BRIEF §3: transform/opacity only — animating
 * the slot's width shifted the intro and CTA below for the whole cycle).
 *
 * LCP contract (same as RiseInWords): the static words and the first
 * rotating word SSR fully visible, offset only by transforms — opacity
 * never leaves 1 on the load path. Rotation starts client-side after
 * hydration; screen readers get the canonical positioning statement via
 * the caller's sr-only sibling, so this whole element is aria-hidden.
 */

export interface HeroWord {
  key: Category;
  label: string;
}

export interface HeroHeadlineProps {
  /** Already-translated text before the rotating slot ('' in English). */
  prefix: string;
  /** Already-translated text after the rotating slot. */
  suffix: string;
  /** Rotation words in display order; at least one. */
  words: readonly HeroWord[];
}

// -800 stops: the only tier where every category tone (saffron included)
// holds ≥3:1 on white at display size. Literal classes for Tailwind v4
// detection, same pattern as CATEGORY_DOT / TILE_DISC.
const WORD_TONE: Record<Category, string> = {
  nature: 'text-juniper-green-800',
  heritage: 'text-al-qatt-red-800',
  food: 'text-saffron-gold-800',
  wellness: 'text-wadi-mint-800',
  adventure: 'text-soudah-sunset-800',
  family: 'text-sarawat-blue-800',
  women_only: 'text-tihama-coral-800',
};

const BASE_DELAY = 0.03;
const STAGGER = 0.025;
const ROTATE_MS = 2400;

const splitWords = (text: string) => text.split(' ').filter(Boolean);

export function HeroHeadline({ prefix, suffix, words }: HeroHeadlineProps) {
  const reduce = useReducedMotion();
  const prefixWords = splitWords(prefix);
  const suffixWords = splitWords(suffix);

  const [index, setIndex] = useState(0);
  // Measured px width of every rotation word; null until first layout.
  const [widths, setWidths] = useState<readonly number[] | null>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduce || words.length < 2) return;
    // One full cycle, then settle — on the WIDEST word, not index 0
    // (P2-3): the slot is already sized to that word, so settling there
    // leaves no dead gap in the fixed-width slot. Indefinite rotation has
    // no pause mechanism (WCAG 2.2.2), and a headline that never stops
    // moving reads as anything but restraint.
    const widestIndex = widths && widths.length > 0 ? widths.indexOf(Math.max(...widths)) : 0;
    let steps = 0;
    const id = setInterval(() => {
      // A hidden tab freezes rAF, so exits can't run — advancing anyway
      // piles un-exited words into the DOM until the tab returns.
      if (document.hidden) return;
      steps += 1;
      if (steps >= words.length) {
        setIndex(widestIndex);
        clearInterval(id);
        return;
      }
      setIndex((i) => (i + 1) % words.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [reduce, words.length, widths]);

  // Re-measure whenever the hidden measurer resizes (font swap, viewport
  // type-scale change) so the slot width always matches the live glyphs.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () =>
      setWidths(Array.from(el.children, (child) => (child as HTMLElement).offsetWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [words]);

  const active = words[Math.min(index, words.length - 1)];
  // Fixed slot width = widest word (per locale — the measurer holds this
  // locale's labels). Before the first client measurement the slot sizes
  // to its SSR content (the first word); the one-time settle to the max
  // happens at hydration, never during rotation.
  const slotWidth = widths && widths.length > 0 ? Math.max(...widths) : undefined;

  if (reduce) {
    return (
      <span aria-hidden>
        {prefix && `${prefix} `}
        {active && <span className={WORD_TONE[active.key]}>{active.label}</span>}
        {suffix && ` ${suffix}`}
      </span>
    );
  }

  const cascade = (word: string, position: number) => (
    <motion.span
      className="inline-block"
      initial={{ y: 14 }}
      animate={{ y: 0 }}
      transition={{ ...SPRING, delay: BASE_DELAY + position * STAGGER }}
    >
      {word}
    </motion.span>
  );

  return (
    <span aria-hidden>
      {prefixWords.map((word, i) => (
        <Fragment key={`p-${i}`}>
          {i > 0 && ' '}
          {cascade(word, i)}
        </Fragment>
      ))}
      {prefixWords.length > 0 && ' '}
      {active && (
        // Outer span: cascade rise in sentence order. Inner span: the
        // fixed-width slot the rotating words swap inside — width is
        // static (the widest word), never animated (BRIEF §3).
        <motion.span
          className="inline-block"
          initial={{ y: 14 }}
          animate={{ y: 0 }}
          transition={{ ...SPRING, delay: BASE_DELAY + prefixWords.length * STAGGER }}
        >
          <span
            className="relative inline-block align-baseline whitespace-nowrap"
            style={slotWidth !== undefined ? { width: slotWidth } : undefined}
          >
            {/* Invisible copies of every word, measured for the width spring.
                The size-0 overflow-hidden wrapper keeps this row (all words
                on one nowrap line, far wider than the slot) out of the page's
                scrollable overflow — visibility:hidden alone still let it pan
                the whole viewport sideways on mobile. */}
            <span aria-hidden className="absolute start-0 top-0 size-0 overflow-hidden">
              <span ref={measureRef} className="invisible whitespace-nowrap">
                {words.map((w) => (
                  <span key={w.key} className="inline-block">
                    {w.label}
                  </span>
                ))}
              </span>
            </span>
            {/* popLayout pops the exiting word out of flow, so the incoming
                word lands with no dead gap (wait mode) and no fading word
                shoving the rest of the sentence. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={active.key}
                className={cn('inline-block', WORD_TONE[active.key])}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={SPRING}
              >
                {active.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
      )}
      {suffixWords.length > 0 && ' '}
      {suffixWords.map((word, i) => (
        <Fragment key={`s-${i}`}>
          {i > 0 && ' '}
          {cascade(word, prefixWords.length + 1 + i)}
        </Fragment>
      ))}
    </span>
  );
}
