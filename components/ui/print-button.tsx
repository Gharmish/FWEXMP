'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PrintButtonProps {
  label: string;
}

/**
 * Print / save-as-PDF affordance for the e-ticket. The page itself is
 * the ticket — `print:hidden` on the chrome (nav, footer, actions)
 * leaves just the reference card and details on paper.
 */
export function PrintButton({ label }: PrintButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="inline-flex items-center gap-2 print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}
