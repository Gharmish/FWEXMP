'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/log';
import { bricolage, ibmPlexArabic } from '@/lib/fonts';
import { buttonVariants } from '@/components/ui/button';
import '@/app/globals.css';

/**
 * Last-resort boundary for errors thrown ABOVE the locale segment —
 * the locale layout itself (next-intl provider, fonts, navbar server
 * queries). Without it those render as Next's unstyled default page and
 * nothing is captured (2026-07 audit M6). It replaces the root layout,
 * so it renders its own <html>/<body> and can't use next-intl — copy is
 * static and bilingual, and `dir` handling is per-line rather than
 * document-level.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { surface: 'global-error-boundary', digest: error.digest });
  }, [error]);

  return (
    <html lang="en" className={`${bricolage.variable} ${ibmPlexArabic.variable} antialiased`}>
      <body className="text-sarat-black bg-white">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-24">
          <p className="text-al-qatt-red-800 text-[11px] font-medium tracking-[0.2em] uppercase">
            Something went wrong
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance">
            We could not load Gharmish.
          </h1>
          <p className="text-sarat-black-600 text-lg" dir="rtl" lang="ar">
            تعذر تحميل غارميش. حاول مرة أخرى بعد قليل.
          </p>
          <p className="text-sarat-black-600 text-lg">
            Try again in a moment. If the issue persists, we are already on it.
          </p>
          <div>
            {/* L17: routed through buttonVariants instead of a hand-rolled
                class string, matching every other CTA in the app. */}
            <button
              type="button"
              onClick={() => reset()}
              className={buttonVariants({ variant: 'premium', size: 'lg' })}
            >
              Try again · حاول مجددًا
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
