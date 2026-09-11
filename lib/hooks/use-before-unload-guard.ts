import { useEffect } from 'react';

/**
 * Ask the browser to confirm before a close/reload discards unsaved
 * edits (2026-09 engineering audit REACT-08 — two copies). Attached only
 * while `dirty`, so a clean form never nags.
 */
export function useBeforeUnloadGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
}
