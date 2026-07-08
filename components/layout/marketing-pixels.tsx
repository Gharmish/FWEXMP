'use client';

import Script from 'next/script';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { clientEnv, hasMarketingPixels } from '@/lib/env';
import { readConsent, subscribeConsent } from '@/components/layout/consent';

/**
 * Snap Pixel + TikTok Pixel loader. Renders nothing (and loads nothing)
 * until BOTH are true: a pixel id is configured in the environment AND
 * the visitor chose "Accept all" in the cookie banner — the moment
 * consent lands, the store notifies and the base snippets mount without
 * a reload. Each vendor's official base snippet fires the first
 * page-view itself; client-side route changes are re-tracked from the
 * pathname effect below (neither SDK observes SPA navigation).
 */

declare global {
  interface Window {
    snaptr?: (...args: unknown[]) => void;
    ttq?: {
      page: (...args: unknown[]) => void;
      track: (...args: unknown[]) => void;
    };
  }
}

function getSnapshot(): boolean {
  return hasMarketingPixels() && readConsent() === 'all';
}

function getServerSnapshot(): boolean {
  return false;
}

export function MarketingPixels() {
  const active = useSyncExternalStore(subscribeConsent, getSnapshot, getServerSnapshot);
  const pathname = usePathname();
  // The pathname already tracked — starts null so the mount run only
  // records (the base snippets cover the first view) and never double-fires.
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (lastTracked.current === null || lastTracked.current === pathname) {
      lastTracked.current = pathname;
      return;
    }
    lastTracked.current = pathname;
    window.snaptr?.('track', 'PAGE_VIEW');
    window.ttq?.page();
  }, [active, pathname]);

  if (!active) return null;

  const snapId = clientEnv.NEXT_PUBLIC_SNAP_PIXEL_ID;
  const tiktokId = clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

  return (
    <>
      {snapId ? (
        <Script id="snap-pixel" strategy="afterInteractive">
          {`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
snaptr('init', ${JSON.stringify(snapId)});
snaptr('track', 'PAGE_VIEW');`}
        </Script>
      ) : null}
      {tiktokId ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load(${JSON.stringify(tiktokId)});
ttq.page();
}(window, document, 'ttq');`}
        </Script>
      ) : null}
    </>
  );
}
