import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Button — pill shaped, restraint-first. No shadows (BRIEF §3).
 * Variants: primary / secondary / premium. Sizes: sm 32 / md 44 / lg 52.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap transition-transform duration-200 select-none hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-sarat-black text-fog-white',
        secondary: 'border-sarat-black/20 bg-transparent text-sarat-black [border-width:0.5px]',
        premium: 'bg-saffron-gold text-sarat-black',
      },
      size: {
        sm: 'h-8 px-4 text-sm',
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
