import { cn } from '@/lib/utils';

/**
 * Gharmish verification seal — a 12-lobe notched rosette (notary-seal
 * geometry) holding a check. This is the one mark for "Verified by
 * Gharmish": always juniper (green vouches; gold sells), and rendered
 * only on surfaces where a human review actually happened — never as
 * decoration.
 */
const ROSETTE_PATH =
  'M20 1Q22.58 0.41 24.24 4.16Q26.53 4.24 29.5 3.55Q32.03 4.32 31.6 8.4Q33.53 9.62 36.45 10.5Q38.26 12.44 35.84 15.76Q36.91 17.77 39 20Q39.59 22.58 35.84 24.24Q35.76 26.53 36.45 29.5Q35.68 32.03 31.6 31.6Q30.38 33.53 29.5 36.45Q27.56 38.26 24.24 35.84Q22.23 36.91 20 39Q17.42 39.59 15.76 35.84Q13.47 35.76 10.5 36.45Q7.97 35.68 8.4 31.6Q6.47 30.38 3.55 29.5Q1.74 27.56 4.16 24.24Q3.09 22.23 1 20Q0.41 17.42 4.16 15.76Q4.24 13.47 3.55 10.5Q4.32 7.97 8.4 8.4Q9.62 6.47 10.5 3.55Q12.44 1.74 15.76 4.16Q17.77 3.09 20 1Z';

export interface VerifiedSealProps {
  /** Accessible name; omit when adjacent text already says "verified". */
  label?: string;
  className?: string;
}

export function VerifiedSeal({ label, className }: VerifiedSealProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('text-juniper-green size-5 shrink-0', className)}
    >
      <path d={ROSETTE_PATH} fill="currentColor" />
      <path
        d="M13 20.8 17.8 25.6 27 15.8"
        fill="none"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-white"
      />
    </svg>
  );
}
