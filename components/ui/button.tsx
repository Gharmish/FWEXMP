import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Button — pill shaped, restraint-first. No shadows (BRIEF §3).
 * Variants: primary / secondary / premium. Sizes: sm 44 / md 44 / lg 52.
 *
 * A visible keyboard focus ring is mandatory (BRIEF §6: "Focus rings
 * visible, never removed"); it comes from the single global `:focus-visible`
 * ring in globals.css — components must not add their own (avoids a doubled
 * ring). `sm` keeps the 44px touch-target floor — it differs from `md` only
 * in horizontal padding and type size.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap transition-transform duration-200 select-none hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-70 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-sarat-black text-white',
        secondary: 'border-sarat-black/20 bg-transparent text-sarat-black [border-width:0.5px]',
        premium: 'bg-saffron-gold text-sarat-black',
      },
      size: {
        sm: 'h-11 px-4 text-sm',
        md: 'h-11 px-6 text-base',
        lg: 'h-13 px-8 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /**
   * Pending/submitting state: disables the button and marks it `aria-busy`
   * so the label (e.g. a next-intl "Saving…" string) communicates progress
   * without a content spinner.
   */
  pending?: boolean;
}

export function Button({
  className,
  variant,
  size,
  type = 'button',
  pending = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      aria-busy={pending || undefined}
      disabled={disabled ?? pending}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
