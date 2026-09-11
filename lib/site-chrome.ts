/**
 * Which pages carry the public marketing shell — navbar, footer and the
 * auth fan-out behind them (2026-09 engineering audit REACT-05). The
 * admin and host dashboards bring their own rail, and used to render the
 * public shell anyway and hide it with an injected `<style>`. The proxy
 * forwards the request pathname as `x-pathname` so the locale layout can
 * decide before rendering anything.
 */
const DASHBOARD_PREFIX = /^\/(?:en|ar)\/(?:admin|host)(?:\/|$)/;
/** The host application lives under /host but is a public-shell page. */
const HOST_APPLY = /^\/(?:en|ar)\/host\/apply(?:\/|$)/;

export const PATHNAME_HEADER = 'x-pathname';

export function showsSiteChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  if (HOST_APPLY.test(pathname)) return true;
  return !DASHBOARD_PREFIX.test(pathname);
}
