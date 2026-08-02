import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Badge — small pill status label. Tints use brand color ramps
 * at low alpha (BRIEF §3: no off-palette hex, no shadows).
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-button px-3 py-1 text-xs font-medium whitespace-nowrap [&_svg]:size-4',
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
