'use client';

import {
  motion,
  MotionConfig,
  useReducedMotion,
  type Transition,
  type Variants,
} from 'framer-motion';
import type { ReactNode } from 'react';

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
  if (reduce) return <div className={className}>{children}</div>;
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
  if (reduce) return <div className={className}>{children}</div>;
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
  if (reduce) return <div className={className}>{children}</div>;
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

/** Per-route crossfade wrapper. Mount inside app/[locale]/template.tsx. */
export function PageTransition({ children, className }: MotionPrimitiveProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
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
