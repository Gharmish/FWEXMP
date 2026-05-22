'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Spring hover/focus lift (BRIEF §3 motion): the only motion curve we
 * use is Framer's spring (damping 25, stiffness 280) — never ease-*.
 * Lifts 2px on hover/focus. Disabled when the user prefers reduced
 * motion (no transform, no transition).
 */
const SPRING = { type: 'spring', damping: 25, stiffness: 280 } as const;

export interface MotionLiftProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionLift({ children, className }: MotionLiftProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      whileHover={{ y: -2 }}
      whileFocus={{ y: -2 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}
