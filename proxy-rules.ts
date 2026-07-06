/**
 * Pure path rules for the edge auth gate — split out of proxy.ts so
 * proxy.test.ts can import them without dragging in next-intl's
 * middleware (whose ESM build doesn't resolve under vitest's Node
 * loader). No imports, no I/O: just the prefix rules.
 *
 * Paths under `/[locale]` that require an authenticated session; the
 * exceptions are the public host-application entry points.
 */
const AUTH_REQUIRED_PREFIXES = ['/host', '/admin'];
const AUTH_REQUIRED_EXCEPTIONS = ['/host/apply', '/host/apply/submitted'];

export function pathRequiresAuth(localeRelative: string): boolean {
  // Exact-match the exceptions first so they take precedence.
  if (
    AUTH_REQUIRED_EXCEPTIONS.some((p) => localeRelative === p || localeRelative.startsWith(`${p}/`))
  ) {
    return false;
  }
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => localeRelative === prefix || localeRelative.startsWith(`${prefix}/`),
  );
}
