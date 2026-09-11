import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  /** Whole-star rating, 0–5 (fractions are floored). */
  rating: number;
  /** Spoken form — the visual stars are decorative. */
  label: string;
  size?: 'sm' | 'md';
  /** `low` paints the filled stars in the error tone (admin feedback triage). */
  tone?: 'default' | 'low';
  className?: string;
}

/**
 * The one five-star row (2026-09 engineering audit I18N-08 / REACT-08).
 * Six hand-rolled copies painted filled stars saffron-gold on white at
 * ~1.8:1 and empty stars at 20% black — below the 3:1 floor WCAG 1.4.11
 * asks of informational graphics. Filled stars here carry a
 * sarat-black/40 stroke so their edge meets 3:1 on white, and empty stars
 * sit at 40% rather than 20%, so the filled/empty distinction survives
 * low vision and colour deficiency. The group is announced once via
 * `label`; the icons are hidden from assistive tech.
 */
export function StarRating({
  rating,
  label,
  size = 'md',
  tone = 'default',
  className,
}: StarRatingProps) {
  const filled = Math.max(0, Math.min(5, Math.floor(rating)));
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            size === 'sm' ? 'size-3.5' : 'size-4',
            'shrink-0',
            i < filled
              ? tone === 'low'
                ? 'fill-al-qatt-red text-al-qatt-red'
                : 'fill-saffron-gold-600 text-saffron-gold-600 stroke-sarat-black/40'
              : 'text-sarat-black/40',
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
