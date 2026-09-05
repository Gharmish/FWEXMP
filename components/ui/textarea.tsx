import { cn } from '@/lib/utils';

/**
 * Gharmish Textarea — shared primitive (P3-29). Mirrors Input's styling
 * (rounded-input, 0.5px hairline, focus ring from the global
 * :focus-visible rule) so the 21 raw `<textarea>` call sites this
 * package does not own can adopt one class string instead of each
 * hand-rolling its own (one had already drifted to `px-3`).
 */
export type TextareaProps = React.ComponentProps<'textarea'>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        // M23: same /45 border as Input (was /20, 1.30–1.57:1 against the
        // 3:1 floor for field boundaries).
        'rounded-input border-sarat-black/45 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
        'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-al-qatt-red',
        className,
      )}
      {...props}
    />
  );
}
