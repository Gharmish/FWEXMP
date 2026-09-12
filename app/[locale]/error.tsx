'use client';

import { ErrorPage } from '@/components/layout/error-page';

/**
 * Locale-level error boundary: catches an error thrown inside the admin,
 * host or (site) LAYOUT. It renders outside the (site) shell, so it brings
 * its own <main> landmark for the skip link (third-round verification N3).
 */
export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
      <ErrorPage error={error} retry={unstable_retry} surface="locale-error-boundary" />
    </main>
  );
}
