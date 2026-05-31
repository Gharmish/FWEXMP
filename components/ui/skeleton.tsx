import { cn } from '@/lib/utils';

/**
 * Gharmish Skeleton — token-styled loading placeholder (BRIEF §3 + cross-cutting
 * loading rule). Use to mirror the final layout so there is no layout shift on
 * load; never a spinner. The pulse honours `prefers-reduced-motion` globally
 * (see globals.css). `radius` matches the element it stands in for.
 */
const radiusMap = {
  none: 'rounded-none',
  sm: 'rounded',
  full: 'rounded-full',
  button: 'rounded-button',
  input: 'rounded-input',
  image: 'rounded-image',
  card: 'rounded-card',
} as const;

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  radius?: keyof typeof radiusMap;
}

export function Skeleton({ className, radius = 'sm', ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-sarat-black/8 animate-pulse', radiusMap[radius], className)}
      {...props}
    />
  );
}
