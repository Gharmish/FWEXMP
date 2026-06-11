import { cn } from '@/lib/utils';

/**
 * Gharmish Input — rounded-input, 44px tall, 0.5px hairline border.
 * The visible focus ring is provided globally by :focus-visible
 * (app/globals.css); no shadow (BRIEF §3).
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'rounded-input border-sarat-black/20 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-4 text-base',
        'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-al-qatt-red',
        className,
      )}
      {...props}
    />
  );
}
