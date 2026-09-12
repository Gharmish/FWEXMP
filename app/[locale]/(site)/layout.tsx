import { Suspense } from 'react';
import { cookies } from 'next/headers';
import type { Locale } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { AuthNavLinks } from '@/features/auth/components/auth-nav-links';
import { WISHLIST_COOKIE, parseWishlistCookie } from '@/features/wishlist/cookie';

/**
 * The public site shell — navbar, footer and the auth fan-out behind them
 * (2026-09 engineering audit REACT-05). It lives in THIS route group's
 * layout so the admin and host dashboards, siblings outside the group,
 * never render it and a soft navigation between the two worlds swaps the
 * layout itself. The first cut decided this in the locale layout from an
 * `x-pathname` header, which Next does not re-render on client-side
 * navigation: a host clicking "Host dashboard" kept the public shell and
 * "Back to site" arrived with none (second-pass verification F4).
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Cookie-only read (no DB): the heart entry point shows once this
  // device has saved anything — an empty wishlist earns no nav slot.
  const cookieStore = await cookies();
  const hasWishlist = parseWishlistCookie(cookieStore.get(WISHLIST_COOKIE)?.value).length > 0;

  return (
    <>
      <Navbar
        hasWishlist={hasWishlist}
        authLinks={
          // Streams behind its own boundary so first byte never waits on
          // the auth round-trips; the page stays OUTSIDE any boundary so
          // notFound()/redirect() codes hold.
          <Suspense fallback={<span className="min-h-11 min-w-11" aria-hidden />}>
            <AuthNavLinks locale={locale as Locale} />
          </Suspense>
        }
      />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </>
  );
}
