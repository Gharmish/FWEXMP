/**
 * The one HTML escaper for hand-built email and alert markup (2026-09
 * engineering audit GAPB-10 — three identical copies). Escapes the four
 * characters that can break out of text or a double-quoted attribute.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
