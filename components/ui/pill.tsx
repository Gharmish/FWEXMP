import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/colors';

/**
 * Gharmish Pill — a selectable filter / category chip. Distinct from Badge:
 * Badge is a static status label, Pill is an interactive toggle (search
 * filters, category facets). Renders a real <button> with `aria-pressed`.
 *
 * Unselected pills are a neutral 0.5px hairline. Selected pills fill: the
 * neutral fill for plain filters, or the immutable category tint
 * (BRIEF §3 category→color map) when a `category` is given. Category
 * classes are enumerated statically so Tailwind can see them — never
 * build them dynamically. No shadows (BRIEF §3). Height holds the 44px
 * touch-target minimum (BRIEF §6).
 */
const pillVariants = cva(
  'inline-flex h-11 shrink-0 items-center gap-2 rounded-button px-4 text-sm font-medium whitespace-nowrap transition-transform duration-200 select-none hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      category: {
        none: '',
        nature: '',
        heritage: '',
        food: '',
        wellness: '',
        adventure: '',
        family: '',
        women_only: '',
      },
      selected: {
        true: '',
        false:
          'border-sarat-black/20 bg-transparent text-sarat-black [border-width:0.5px] hover:border-sarat-black/40',
      },
    },
    compoundVariants: [
      { selected: true, category: 'none', class: 'bg-sarat-black text-white' },
      { selected: true, category: 'nature', class: 'bg-juniper-green/12 text-juniper-green-800' },
      { selected: true, category: 'heritage', class: 'bg-al-qatt-red/12 text-al-qatt-red-800' },
      { selected: true, category: 'food', class: 'bg-saffron-gold/15 text-saffron-gold-900' },
      { selected: true, category: 'wellness', class: 'bg-wadi-mint/20 text-wadi-mint-800' },
      {
        selected: true,
        category: 'adventure',
        class: 'bg-soudah-sunset/12 text-soudah-sunset-800',
      },
      { selected: true, category: 'family', class: 'bg-sarawat-blue/12 text-sarawat-blue-800' },
      {
        selected: true,
        category: 'women_only',
        class: 'bg-tihama-coral/20 text-tihama-coral-800',
      },
    ],
    defaultVariants: {
      category: 'none',
      selected: false,
    },
  },
);

export interface PillProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-pressed'
> {
  /** Category tint applied when selected. Omit for a neutral filter. */
  category?: Category;
  /** Selected (pressed) state. Drives the fill and `aria-pressed`. */
  selected?: boolean;
}

export function Pill({
  className,
  category,
  selected = false,
  type = 'button',
  ...props
}: PillProps) {
  return (
    <button
      type={type}
      data-slot="pill"
      aria-pressed={selected}
      className={cn(pillVariants({ category: category ?? 'none', selected }), className)}
      {...props}
    />
  );
}

export { pillVariants };
