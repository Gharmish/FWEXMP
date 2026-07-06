'use client';

import { ErrorState } from '@/components/layout/error-state';

/**
 * Host dashboard segment error boundary — keeps the rail shell alive and
 * offers a retry instead of bubbling to the bare locale-level boundary.
 */
export default function HostDashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorState error={error} retry={unstable_retry} surface="host-dashboard-error-boundary" />
  );
}
