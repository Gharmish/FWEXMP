import { TracePath } from '@/components/ui/motion';

/**
 * Decorative Sarawat ridgeline — a single hairline tracing an Asir mountain
 * profile, drawn in as the hero settles. It doubles as the divider between
 * the hero and the category row, so no border hairline sits beside it. The
 * RTL mirror makes the stroke draw from the inline-start edge in Arabic.
 */
export function HeroRidgeline() {
  return (
    <svg
      viewBox="0 0 1200 56"
      preserveAspectRatio="none"
      aria-hidden
      className="text-sarat-black/15 h-10 w-full sm:h-14 rtl:-scale-x-100"
    >
      <TracePath
        d="M0 50 H150 L235 33 L305 41 L385 16 L455 37 L530 27 L610 45 L690 39 L775 22 L850 41 L935 33 L1015 50 H1200"
        delay={0.35}
      />
    </svg>
  );
}
