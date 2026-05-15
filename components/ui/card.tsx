import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Card — rounded-card, 0.5px hairline border, no shadow (BRIEF §3).
 * `default` is the light Fog White surface; `dark` is the Sarat Black
 * surface used for the Originals tier.
 */
const cardVariants = cva('rounded-card [border-width:0.5px] overflow-hidden', {
  variants: {
    variant: {
      default: 'border-sarat-black/8 bg-fog-white text-sarat-black',
      dark: 'border-fog-white/10 bg-sarat-black text-fog-white',
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
