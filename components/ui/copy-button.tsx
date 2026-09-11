'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  /** The full value placed on the clipboard (may differ from what's displayed). */
  value: string;
  /** Accessible name, e.g. "Copy IBAN". */
  label: string;
  /** Announced to assistive tech once the copy succeeded, e.g. "IBAN copied". */
  copiedLabel: string;
  className?: string;
}

/**
 * Icon button that copies `value` to the clipboard, with a brief
 * checkmark confirmation. Used where a value renders masked but the
 * operator needs the full string (e.g. payout IBANs).
 */
export function CopyButton({ value, label, copiedLabel, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / insecure context): the icon
      // stays, the live region says nothing was copied.
      setFailed(true);
      setTimeout(() => setFailed(false), 1500);
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <>
      {/* The icon swap is visual only; this is what a screen reader hears
          (2026-09 engineering audit I18N-03). */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : failed ? label : ''}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={cn(
          'text-sarat-black-600 hover:text-sarat-black inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200',
          copied && 'text-success',
          className,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
      </button>
    </>
  );
}
