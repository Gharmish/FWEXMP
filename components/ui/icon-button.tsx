import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish IconButton — square, icon-only action. No shadows (BRIEF §3).
 * Variant vocabulary mirrors Button (primary / secondary / premium) so the
 * two stay visually consistent; default is the restrained hairline.
 *
 * Accessibility (BRIEF §6): icon-only controls carry no text, so
 * `aria-label` is required by the type. Sizes never drop below the
 * 44×44px touch-target minimum — that is why there is no `sm`.
 */
const iconButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-button transition-transform duration-200 select-none hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron-gold focus-visible:ring-offset-2 focus-visible:ring-offset-fog-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-sarat-black text-fog-white',
        secondary: 'border-sarat-black/20 bg-transparent text-sarat-black [border-width:0.5px]',
        premium: 'bg-saffron-gold text-sarat-black',
      },
      size: {
        md: 'size-11',
        lg: 'size-13',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  /** Required: icon-only controls must be labelled for assistive tech. */
  'aria-label': string;
}

export function IconButton({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      data-slot="icon-button"
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { iconButtonVariants };
