'use client';

import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { SPRING } from '@/components/ui/motion';

/**
 * Sticky nav chrome that intensifies on scroll: at rest a translucent
 * blur with the standard /8 hairline; past 8px of scroll a solid white
 * layer and a stronger hairline spring in (opacity only — transform/
 * opacity rule). The nav content itself stays a Server Component and is
 * passed through as children.
 */
export function NavShell({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8));

  return (
    <header
      data-site-chrome
      className="border-sarat-black/8 sticky top-0 z-50 [border-bottom-width:0.5px] bg-white/70 backdrop-blur-md print:hidden"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-white"
        initial={false}
        animate={{ opacity: scrolled ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : SPRING}
      />
      <motion.span
        aria-hidden
        className="bg-sarat-black/15 absolute inset-x-0 bottom-0 h-[0.5px]"
        initial={false}
        animate={{ opacity: scrolled ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : SPRING}
      />
      <div className="relative">{children}</div>
    </header>
  );
}
