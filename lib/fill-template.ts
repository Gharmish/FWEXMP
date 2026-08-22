/**
 * Minimal `{name}` interpolation for copy handed from a Server Component
 * to a Client Component. next-intl's `t()` can't cross that boundary as
 * a function, so the server passes the raw ICU-style template and the
 * client fills it. Only simple `{name}` slots — no plurals/selects.
 */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
