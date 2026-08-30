/**
 * Public display name for a review author: first name + initial of the
 * next token ("Sara Alghamdi" → "Sara A.", "سارة الغامدي" → "سارة ا.").
 * The full booking name stays in the DB and on host/admin surfaces;
 * guest-facing review surfaces only ever see this derivation (2026-08
 * homepage audit P1-4 — publishing full booking names, undisclosed, is
 * a real privacy exposure in the launch market).
 *
 * Pure and locale-agnostic so both the server query boundary and the
 * client review form share one derivation.
 */
export function reviewDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  // Arabic compound given names: a bare "عبد" (or "أم"/"أبو") is not a
  // name — fold the next token into the given name before abbreviating.
  const compound = new Set(['عبد', 'أبو', 'ابو', 'أم', 'ام']);
  let first = parts[0];
  let rest = parts.slice(1);
  if (compound.has(first) && rest.length > 0) {
    first = `${first} ${rest[0]}`;
    rest = rest.slice(1);
  }
  const initial = rest[0]?.[0];
  return initial ? `${first} ${initial}.` : first;
}
