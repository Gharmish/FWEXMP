'use client';

import { ErrorPage } from '@/components/layout/error-page';

/** The branded error inside the public shell (the (site) layout owns <main>). */
export default function SiteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorPage error={error} retry={unstable_retry} surface="site-error-boundary" />;
}
