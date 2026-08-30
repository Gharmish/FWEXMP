import { cn } from '@/lib/utils';
import { MadaMark } from '@/components/layout/mada-mark';

/**
 * Payment-network badges, shared by the footer and the checkout page.
 *
 * House style (owner-supplied asset spec, 2026-08-12): every network sits in
 * an identical framed badge — Apple Pay's own badge geometry (25:16 aspect,
 * white fill, black border at 3.33% of height, corner radius at 13.99% of
 * height) applied to all four — so the row needs no per-logo tuning and reads
 * on any surface without a plate. Marks are drawn as inline vectors rather
 * than the supplied rasters, and Mastercard uses the current two-circle
 * symbol rather than the retired pre-2016 lockup in the asset set (both
 * swaps recommended by that set's own README).
 *
 * Palette: the ONE sanctioned exception to BRIEF §3's palette rule
 * (owner-approved 2026-07-08) — Visa, Mastercard, and mada are trademarked
 * marks and keep their own brand colours; the frame and Apple Pay are drawn
 * in `sarat-black`, which is on-palette.
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
  /**
   * Badge order. Default follows the asset spec (logos.json) and stays on
   * the footer; `'checkout'` leads with mada — BRIEF §5 is mada-first and
   * the payment widget honours it, so the "We accept" row at the moment a
   * mada holder scans for their scheme must too.
   */
  order?: 'checkout';
  className?: string;
}

// 50×32 badge per logos.json: radius 32 × 13.99% ≈ 4.5px, border 32 × 3.33% ≈ 1px.
const badgeClassName =
  'border-sarat-black flex aspect-[25/16] h-8 items-center justify-center rounded-[4.5px] border bg-white';

function VisaMark({ name }: { name: string }) {
  // Official Visa wordmark, drawn as vector letterforms in Visa blue (#1434CB)
  // so it reads as the real brand mark rather than styled text.
  return (
    <svg
      role="img"
      aria-label={name}
      viewBox="0 0 750 244"
      focusable={false}
      className="h-[11px] w-auto"
    >
      <path
        fill="#1434CB"
        d="M278.2 236.9H228L259.4 44h50.2l-31.4 192.9zM459.9 48.7c-9.9-3.9-25.6-8.3-45-8.3-49.6 0-84.5 26.4-84.7 64.1-.3 27.8 24.9 43.3 43.9 52.6 19.5 9.5 26 15.7 25.9 24.2-.1 13-15.7 19-30.2 19-20.2 0-30.9-2.9-47.5-10.2l-6.5-3.1-7.1 43.4c11.8 5.4 33.6 10.1 56.2 10.4 52.8 0 87.1-26.1 87.5-66.3.2-22.1-13.2-38.9-42.1-52.6-17.5-8.9-28.3-14.8-28.2-23.8 0-8 9-16.5 28.5-16.5 16.3-.3 28.1 3.5 37.2 7.4l4.5 2.2 6.8-42zM589 44h-38.8c-12 0-21 3.4-26.3 16l-74.6 176.9h52.8s8.6-23.9 10.5-29.1c5.8 0 57.1.1 64.4.1 1.5 6.8 6.1 29 6.1 29H640L589 44zM527.5 168.9c4.2-11.1 20-54.1 20-54.1-.3.5 4.1-11.2 6.7-18.5l3.4 16.7s9.6 46.2 11.6 56l-41.7-.1zM185.9 44l-49.1 131.6-5.2-26.9c-9.1-31-37.7-64.6-69.7-81.4l44.9 169.4 53.2-.1L238.8 44h-52.9z"
      />
      <path
        fill="#1434CB"
        d="M90.9 44H10L9.3 48c63 16.1 104.7 55 122 101.7L113.9 60.1C110.9 47.8 102.1 44.4 90.9 44z"
        opacity="0.85"
      />
    </svg>
  );
}

function MastercardMark({ name }: { name: string }) {
  // Official Mastercard symbol: two interlocking circles (red left, amber
  // right, orange lens where they overlap). At badge size the symbol stands
  // alone, per Mastercard's small-size usage.
  return (
    <svg
      role="img"
      aria-label={name}
      viewBox="20 6 92 68"
      focusable={false}
      className="h-[18px] w-auto"
    >
      <circle cx="54" cy="40" r="34" fill="#EB001B" />
      <circle cx="78" cy="40" r="34" fill="#F79E1B" />
      <path fill="#FF5F00" d="M66 14.6a34 34 0 0 1 0 50.8 34 34 0 0 1 0-50.8z" />
    </svg>
  );
}

function ApplePayMark({ name }: { name: string }) {
  // Apple glyph + "Pay", both in sarat-black (on-palette).
  return (
    <span
      role="img"
      aria-label={name}
      // The Apple Pay lockup always reads glyph-then-"Pay", even in RTL.
      dir="ltr"
      className="text-sarat-black inline-flex items-center gap-0.5 text-xs leading-none font-medium"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        focusable={false}
        className="h-3 w-auto"
      >
        <path d="M17.05 12.04c-.03-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.75 2.46 3 2.41 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.13.75 1.29-.02 2.11-1.18 2.9-2.34.91-1.34 1.29-2.64 1.31-2.71-.03-.01-2.51-.96-2.54-3.83zM14.7 5.36c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.63-2.79 1.43-.61.71-1.15 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34z" />
      </svg>
      Pay
    </span>
  );
}

export function PaymentMarks({ label, names, order, className }: PaymentMarksProps) {
  const marks = {
    applePay: <ApplePayMark name={names.applePay} />,
    visa: <VisaMark name={names.visa} />,
    mastercard: <MastercardMark name={names.mastercard} />,
    mada: <MadaMark name={names.mada} className="h-[11px]" />,
  } as const;
  // Default badge order follows the asset spec (logos.json); 'checkout'
  // puts mada first (see the prop's doc comment).
  const sequence =
    order === 'checkout'
      ? (['mada', 'visa', 'mastercard', 'applePay'] as const)
      : (['applePay', 'visa', 'mastercard', 'mada'] as const);
  return (
    <ul aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {sequence.map((key) => (
        <li key={key} className={badgeClassName}>
          {marks[key]}
        </li>
      ))}
    </ul>
  );
}
