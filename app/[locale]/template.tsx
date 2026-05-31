import type { ReactNode } from 'react';
import { PageTransition } from '@/components/ui/motion';

/**
 * Per-route template. Next remounts a template on every navigation, so this is
 * the right seam for the 200ms route crossfade (BRIEF §3 motion). The
 * transition self-disables under prefers-reduced-motion.
 */
export default function LocaleTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
