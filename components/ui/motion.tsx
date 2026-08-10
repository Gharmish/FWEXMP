'use client';

import {
  motion,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useTransform,
  type Transition,
  type Variants,
} from 'framer-motion';
import { Fragment, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Gharmish motion primitives (BRIEF §3 — Motion).
 *
 * Single source of truth for animation. Spring physics only, never linear /
 * ease curves. Every primitive degrades to a plain, static element when the
 * user prefers reduced motion — no springs, no parallax, no offset reveals.
 *
 * Reuse these; do not scatter raw `motion.*` configs across the app.
 */

/** The one spring. damping 25 / stiffness 280 (BRIEF §3). */
export const SPRING = { type: 'spring', damping: 25, stiffness: 280 } satisfies Transition;

/**
 * Crossfade for route/page transitions (BRIEF §3). Spring-driven opacity —
 * the brief bans `linear`/`ease-*` curves, so the fade rides the one spring.
 */
const CROSSFADE: Transition = SPRING;

interface MotionPrimitiveProps {
  children: ReactNode;
  className?: string;
}

/**
 * True only for components hydrating from the initial server document. Framer
 * serialises `initial` into SSR styles, so an opacity-0 mount animation on
 * first paint hides content until hydration — an LCP hazard. And under
 * `MotionConfig reducedMotion="user"` the server can't know the user's
 * preference, so SSR output and the client's first render disagree — a React
 * hydration mismatch that re-hides already-painted content. All primitives
 * with an `initial` state (PageTransition, MountFade, FadeIn, Stagger,
 * StaggerItem, Draw, TracePath) therefore render static on the very first
 * pass and only animate on client-side navigations.
 *
 * Detection rides `useSyncExternalStore`: the server snapshot (`false`) is
 * what each component also sees during its own hydration render — including
 * inside a Suspense boundary that hydrates after the rest of the page — so
 * the static branch always matches the server HTML. (The previous module-
 * level "first mount" flag broke exactly there: streamed sections hydrated
 * after earlier components' effects had flipped the flag, and mismatched.)
 */
const noopSubscribe = () => () => {};

function useIsInitialDocumentLoad(): boolean {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [isInitial] = useState(!hydrated);
  return isInitial;
}

/**
 * App-wide motion context. `reducedMotion="user"` makes Framer honour the OS
 * setting for any transform/layout animation as a second line of defence
 * behind the per-primitive `useReducedMotion()` guards. Children passed
 * through stay Server Components.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}

interface FadeInProps extends MotionPrimitiveProps {
  /** Stagger/sequence delay in seconds. */
  delay?: number;
  /** Initial vertical offset in px before the spring settles. */
  y?: number;
}

/** Reveal-on-scroll: fades + lifts into place once when scrolled into view. */
export function FadeIn({ children, className, delay = 0, y = 8 }: FadeInProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || isInitial) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

/** Container that reveals its <StaggerItem> children in sequence on scroll. */
export function Stagger({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || isInitial) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
    >
      {children}
    </motion.div>
  );
}

/** A single item within a <Stagger> grid/list. */
export function StaggerItem({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || isInitial) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/** Card-style 2px lift on hover, settles on press. Quiet and spring-driven. */
export function HoverLift({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      whileTap={{ y: 0 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/**
 * Celebratory spring scale-in for a single focal element (e.g. the booking
 * confirmation checkmark). Settles from 0.8→1 once on mount. Static when
 * reduced motion is preferred.
 */
export function Pop({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/**
 * Per-route crossfade wrapper. Mount inside app/[locale]/template.tsx.
 * Static on the initial document load (never SSR `opacity:0` onto the page
 * root — LCP); fades only on client-side navigations.
 */
export function PageTransition({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || isInitial) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={CROSSFADE}
    >
      {children}
    </motion.div>
  );
}

interface RiseInProps extends FadeInProps {
  /** Initial scale the spring settles from (e.g. 1.06 for a hero-image Ken Burns settle). */
  scale?: number;
}

/**
 * Transform-only mount rise for LCP-critical elements (hero H1). Opacity
 * stays 1 the whole time: SSR paints the text visible (offset by `y` px —
 * transforms affect neither LCP nor CLS) and the spring settles it on
 * hydration. Never wrap an LCP candidate in an opacity-from-0 primitive.
 */
export function RiseIn({ children, className, delay = 0, y = 12, scale = 1 }: RiseInProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ y, scale }}
      animate={{ y: 0, scale: 1 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

interface RiseInWordsProps {
  /** The already-translated string to cascade (pass `t('…')`, never a key). */
  text: string;
  className?: string;
  /** Seconds before the first word settles. */
  delay?: number;
  /** Per-word delay in seconds. */
  stagger?: number;
  /** Initial vertical offset in px before each word's spring settles. */
  y?: number;
}

/**
 * Word-by-word RiseIn for hero headlines. Same LCP contract as RiseIn:
 * opacity never leaves 1, so SSR paints every word visible (each offset by
 * `y` px) and the spring cascades them into place on hydration. Words wrap
 * on the normal spaces between them, so line breaking and RTL are untouched.
 */
export function RiseInWords({
  text,
  className,
  delay = 0,
  stagger = 0.04,
  y = 14,
}: RiseInWordsProps) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <Fragment key={`${i}-${word}`}>
          {i > 0 && ' '}
          <motion.span
            className="inline-block"
            initial={{ y }}
            animate={{ y: 0 }}
            transition={{ ...SPRING, delay: delay + i * stagger }}
          >
            {word}
          </motion.span>
        </Fragment>
      ))}
    </span>
  );
}

interface MountFadeProps extends FadeInProps {
  /**
   * Animate even during the initial document load. Only set this on elements
   * that are never the LCP candidate (eyebrows, CTAs, form feedback) — eager
   * elements SSR with opacity 0 until hydration.
   */
  eager?: boolean;
}

/**
 * On-mount fade + lift (not scroll-linked — use FadeIn for whileInView).
 * For above-the-fold staging and post-interaction reveals. Renders static on
 * the initial document load unless `eager`, so content pages pay no LCP cost
 * and still crossfade in on client-side navigations.
 */
export function MountFade({
  children,
  className,
  delay = 0,
  y = 8,
  eager = false,
}: MountFadeProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || (isInitial && !eager)) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

interface FadeSwapProps extends MotionPrimitiveProps {
  /** Key for the current content (e.g. the canonical filter query string). */
  watch: string | number;
}

/**
 * Keyed enter-fade for RSC content swaps (filter/sort results). The server
 * owns the outgoing list, so exit animations are impossible — instead the
 * incoming payload springs in whenever `watch` changes. The very first
 * render (whatever the server sent) stays static.
 */
export function FadeSwap({ watch, children, className }: FadeSwapProps) {
  const reduce = useReducedMotion();
  // The server-rendered first payload stays static; anything after springs in.
  // (Returning to the exact initial key skips one animation — harmless.)
  const [initialWatch] = useState(watch);
  const changed = watch !== initialWatch;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      key={String(watch)}
      className={className}
      initial={changed ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

interface DrawProps extends MotionPrimitiveProps {
  /** 'y' grows down from the top (timeline spines); 'x' grows from inline-start. */
  axis?: 'x' | 'y';
  delay?: number;
}

/**
 * Hairline/spine growth: scales from 0 to full along one axis once in view.
 * The x axis grows from inline-start (flips in RTL).
 */
export function Draw({ children, className, axis = 'y', delay = 0 }: DrawProps) {
  const reduce = useReducedMotion();
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || isInitial) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn(axis === 'y' ? 'origin-top' : 'origin-left rtl:origin-right', className)}
      initial={axis === 'y' ? { scaleY: 0 } : { scaleX: 0 }}
      whileInView={axis === 'y' ? { scaleY: 1 } : { scaleX: 1 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

interface TracePathProps {
  /** SVG path data. */
  d: string;
  className?: string;
  delay?: number;
  /**
   * Animate even during the initial document load (same contract as
   * MountFade's `eager`). Only for decorative strokes that are never the
   * LCP candidate — an eager path SSRs undrawn until hydration.
   */
  eager?: boolean;
}

/**
 * SVG-path variant of Draw: strokes the path from nothing to full length
 * once in view (decorative hairline illustrations — never content). Rendered
 * fully drawn under reduced motion. Non-scaling stroke keeps the hairline
 * true inside stretched (`preserveAspectRatio="none"`) viewBoxes.
 */
export function TracePath({ d, className, delay = 0, eager = false }: TracePathProps) {
  const reduce = useReducedMotion();
  const shared = {
    d,
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke',
  } as const;
  const isInitial = useIsInitialDocumentLoad();
  if (reduce || (isInitial && !eager)) return <path {...shared} />;
  return (
    <motion.path
      {...shared}
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ ...SPRING, delay }}
    />
  );
}

interface ParallaxYProps extends MotionPrimitiveProps {
  /** Max drift in px each way from resting position. Keep ≤ 24. */
  distance?: number;
}

/**
 * Subtle scroll-linked vertical drift. Static under reduced motion, coarse
 * pointers, and viewports below 1024px (perf budget). The caller provides
 * the overflow-hidden frame and any bleed the drift needs.
 */
const PARALLAX_QUERY = '(pointer: fine) and (min-width: 1024px)';

function subscribeParallaxMedia(onChange: () => void) {
  const mql = window.matchMedia(PARALLAX_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** SSR snapshot is false → parallax only engages client-side on capable devices. */
function useParallaxEnabled(): boolean {
  return useSyncExternalStore(
    subscribeParallaxMedia,
    () => window.matchMedia(PARALLAX_QUERY).matches,
    () => false,
  );
}

export function ParallaxY({ children, className, distance = 24 }: ParallaxYProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useParallaxEnabled();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduce || !enabled) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
