'use client';

import { useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/lib/i18n';

/**
 * Backstop that lands every client-side page navigation at the top of the
 * viewport. Next scrolls on <Link> pushes but not on server-action
 * `redirect()`s (sign-in, booking submit), which otherwise arrive on the
 * new page still scrolled to wherever the old one was — often the footer.
 *
 * Keyed on the locale-stripped pathname so it never fires for:
 * - query-only updates (catalog filters/sort/search use scroll:false);
 * - the en↔ar switch on the same page;
 * - browser back/forward (popstate keeps native scroll restoration);
 * - #hash navigations, which keep their anchor.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPathname = useRef(pathname);
  const isPopNavigation = useRef(false);

  useLayoutEffect(() => {
    const onPopState = () => {
      isPopNavigation.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // searchParams is a dependency only so query-level commits consume a
  // pending popstate flag; scrolling itself is gated on a pathname change.
  useLayoutEffect(() => {
    const wasPop = isPopNavigation.current;
    isPopNavigation.current = false;
    const pathChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (!pathChanged || wasPop || window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname, searchParams]);

  return null;
}
