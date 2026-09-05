import { cn } from '@/lib/utils';

/**
 * Gharmish Select — shared primitive (P3-29). Mirrors Input/Textarea
 * styling so the 10 raw `<select>` call sites this package does not own
 * can adopt one class string instead of each hand-rolling its own (they
 * currently drift, e.g. `px-3` vs `px-4`). Plain native `<select>` —
 * matches the browser chrome the app already ships, no custom listbox.
 */
export type SelectProps = React.ComponentProps<'select'>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        // M23: same /45 border as Input (was /20 on the hand-rolled
        // SELECT_CLASS strings, 1.30–1.57:1 against the 3:1 floor).
        'rounded-input border-sarat-black/45 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-4 text-base',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-al-qatt-red',
        className,
      )}
      {...props}
    />
  );
}
