'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  /** The full value placed on the clipboard (may differ from what's displayed). */
  value: string;
  /** Accessible name, e.g. "Copy IBAN". */
  label: string;
  className?: string;
}

/**
 * Icon button that copies `value` to the clipboard, with a brief
 * checkmark confirmation. Used where a value renders masked but the
 * operator needs the full string (e.g. payout IBANs).
 */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
  }

  const Icon = copied ? Check : Copy;
  return (
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
  );
}
