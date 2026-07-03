'use client';

import type { ReactNode } from 'react';
import { MountFade } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

interface FieldErrorProps {
  children?: ReactNode;
  /** Wire to the input via aria-describedby. */
  id?: string;
  className?: string;
}

/**
 * Inline form-field error: springs in (fade + 4px lift) with role="alert".
 * Renders nothing when there is no error. Pair with aria-invalid on the
 * input, which flips its border to the error tone as an instant state
 * change (BRIEF §3 — no keyframe shakes; the one spring only).
 */
export function FieldError({ children, id, className }: FieldErrorProps) {
  if (!children) return null;
  return (
    <MountFade eager y={4} className={cn('mt-2', className)}>
      <p id={id} role="alert" className="text-error text-sm">
        {children}
      </p>
    </MountFade>
  );
}
