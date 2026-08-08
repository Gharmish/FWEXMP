import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Badge — small pill status label. Tints use brand color ramps
 * at low alpha (BRIEF §3: no off-palette hex, no shadows).
 */
// `whitespace-nowrap` keeps chips on one line, but sentence-length labels
// ("Speaks Arabic, English, and French") then have a min-content wider than a
// 320px viewport's content box — enough to scroll the whole detail page
// sideways. Below 380px the chip is allowed to wrap instead. Scoped that
// tightly on purpose: overflow only starts under ~370px, so every normal
// phone keeps single-line chips exactly as designed.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-button px-3 py-1 text-xs font-medium whitespace-nowrap max-[380px]:whitespace-normal [&_svg]:size-4',
  {
    variants: {
      variant: {
        verified: 'bg-juniper-green/10 text-juniper-green-800',
        licensed: 'bg-saffron-gold/15 text-rijal-clay',
        neutral: 'bg-sarat-black/8 text-sarat-black',
        soldOut: 'bg-rijal-clay/10 text-rijal-clay',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
