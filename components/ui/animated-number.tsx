'use client';

import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  /** Defaults to Intl.NumberFormat in the active locale, Latin digits (BRIEF §4). */
  format?: (n: number) => string;
  className?: string;
  /** Delay in seconds before the count-up starts. */
  delay?: number;
}

/**
 * Stat count-up on the one spring. SSR, reduced motion, and pre-in-view all
 * render the final formatted value (no CLS, no hydration mismatch); once in
 * view the number springs 0→value, written via ref so no re-render per frame.
 */
export function AnimatedNumber({ value, format, className, delay = 0 }: AnimatedNumberProps) {
  const locale = useLocale();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [done, setDone] = useState(false);

  const fmt =
    format ?? ((n: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(n));

  const fmtRef = useRef(fmt);
  useEffect(() => {
    fmtRef.current = fmt;
  });

  useEffect(() => {
    if (!inView || reduce || done) return;
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, value, {
      ...SPRING,
      delay,
      onUpdate: (v) => {
        node.textContent = fmtRef.current(Math.round(v));
      },
      onComplete: () => {
        node.textContent = fmtRef.current(value);
        setDone(true);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, done, value, delay]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {fmt(value)}
    </span>
  );
}
