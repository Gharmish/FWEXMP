import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The project's `@utility` type scale (app/globals.css). tailwind-merge
 * knows nothing about them and files every unknown `text-*` class under
 * text-COLOUR, so `cn('text-sarat-black-600 text-eyebrow')` used to keep
 * only the last one (2026-09 engineering audit, second-pass verification
 * F1 — 81 call sites lost either their colour or their type style). They
 * are font-size utilities: a later one replaces an earlier size, never a
 * colour. lib/utils.test.ts pins this; add any new `@utility text-*` here.
 */
export const TYPE_SCALE_UTILITIES = [
  'text-display',
  'text-display-fixed',
  'text-h1',
  'text-h1-lg',
  'text-h1-sm',
  'text-h1-fixed',
  'text-h2',
  'text-h2-responsive',
  'text-h2-lg',
  'text-h2-xl',
  'text-h3',
  'text-eyebrow',
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [...TYPE_SCALE_UTILITIES] } },
});

/**
 * Merge conditional class names and de-conflict Tailwind utilities.
 * Use everywhere instead of manual template strings.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
