import { cn } from '@/lib/utils';
import { MadaMark } from '@/components/layout/mada-mark';

/**
 * Payment-network marks, shared by the footer and the checkout page.
 *
 * This is the ONE sanctioned exception to BRIEF §3's palette rule
 * (owner-approved 2026-07-08): Visa, Mastercard, and mada are trademarked marks
 * and must appear in their own brand colours to read as the real payment badges
 * — the palette rule governs our surfaces, not third-party logos. Apple Pay is
 * drawn in `sarat-black`, which is already on-palette. Each mark sits on a white
 * tile so the colours stay legible on any surface, mirroring how the card badges
 * appear at checkout. mada uses the official Saudi Payments lockup
 * ({@link MadaMark}); the rest are drawn inline below.
 */

interface PaymentMarksProps {
  /** Accessible group label ("Accepted payment methods"), localised by the caller. */
  label: string;
  /** Per-brand accessible names, localised by the caller. */
  names: {
    mada: string;
    visa: string;
    mastercard: string;
    applePay: string;
  };
  className?: string;
}

const tileClassName =
  'border-sarat-black/8 inline-flex h-7 items-center rounded-md border-[0.5px] bg-white px-2.5';

function VisaMark({ name }: { name: string }) {
  // Visa wordmark — the classic Visa blue, bold italic.
  return (
    <span
      role="img"
      aria-label={name}
      className="[font-family:Arial,Helvetica,sans-serif] text-[13px] font-bold tracking-wide text-[#1434CB] uppercase italic"
    >
      Visa
    </span>
  );
}

function MastercardMark({ name }: { name: string }) {
  // Two interlocking circles: red left, amber right, orange lens where they meet.
  return (
    <svg role="img" aria-label={name} viewBox="0 0 40 25" focusable={false} className="h-4 w-auto">
      <circle cx="15" cy="12.5" r="9.5" fill="#EB001B" />
      <circle cx="25" cy="12.5" r="9.5" fill="#F79E1B" />
      <path fill="#FF5F00" d="M20 4.42a9.5 9.5 0 0 1 0 16.16 9.5 9.5 0 0 1 0-16.16z" />
    </svg>
  );
}

function ApplePayMark({ name }: { name: string }) {
  // Apple glyph + "Pay", both in sarat-black (on-palette).
  return (
    <span
      role="img"
      aria-label={name}
      className="text-sarat-black inline-flex items-center gap-0.5 text-[13px] leading-none font-medium"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        focusable={false}
        className="h-3.5 w-auto"
      >
        <path d="M17.05 12.04c-.03-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.75 2.46 3 2.41 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.13.75 1.29-.02 2.11-1.18 2.9-2.34.91-1.34 1.29-2.64 1.31-2.71-.03-.01-2.51-.96-2.54-3.83zM14.7 5.36c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.63-2.79 1.43-.61.71-1.15 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34z" />
      </svg>
      Pay
    </span>
  );
}

export function PaymentMarks({ label, names, className }: PaymentMarksProps) {
  return (
    <ul aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      <li className={tileClassName}>
        <MadaMark name={names.mada} />
      </li>
      <li className={tileClassName}>
        <VisaMark name={names.visa} />
      </li>
      <li className={tileClassName}>
        <MastercardMark name={names.mastercard} />
      </li>
      <li className={tileClassName}>
        <ApplePayMark name={names.applePay} />
      </li>
    </ul>
  );
}
