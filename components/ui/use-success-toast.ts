import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';

/**
 * Fire the "saved" toast once per successful action result (2026-09
 * engineering audit REACT-08 — six copies of the same effect). Pass a
 * module-level predicate so the effect's dependency list stays honest:
 * a new `state` object is what re-fires the toast, not the boolean.
 */
export function useSuccessToast<T>(state: T, succeeded: (state: T) => boolean, title: string) {
  useEffect(() => {
    if (succeeded(state)) toast({ title, tone: 'success' });
  }, [state, succeeded, title]);
}
