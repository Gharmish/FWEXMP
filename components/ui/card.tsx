import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Card — rounded-card, 1px hairline border, no shadow (BRIEF §3).
 * `default` is the white surface (premium redesign 2026-06 retired Fog
 * White); `dark` is the Sarat Black surface used for the Originals tier.
 */
const cardVariants = cva('rounded-card border overflow-hidden', {
  variants: {
    variant: {
      default: 'border-sarat-black/12 bg-white text-sarat-black',
      dark: 'border-white/10 bg-sarat-black text-white',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />;
}
