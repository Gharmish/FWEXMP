/**
 * KSA phone normalisation for the auth layer.
 *
 * Supabase phone OTP needs an E.164 string (`+9665XXXXXXXX`). Users
 * type any of:
 *
 *   - `+966 5X XXX XXXX`  ← the placeholder we show
 *   - `+9665XXXXXXXX`     ← bare E.164
 *   - `05XXXXXXXX`        ← local with the leading 0
 *   - `5XXXXXXXX`         ← bare local
 *
 * `toE164Saudi()` canonicalises all of these to `+9665XXXXXXXX`, and
 * returns `null` for anything else. This is the single chokepoint —
 * the auth zod schema, the stub session, and the real Supabase call
 * all go through it. Mirrors the same input shapes accepted by
 * `bookingRequestSchema` so the two flows stay consistent.
 */
export function toE164Saudi(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local: string | null = null;

  if (digits.length === 10 && digits.startsWith('05')) {
    local = digits.slice(1); // drop leading 0 → 5XXXXXXXX
  } else if (digits.length === 9 && digits.startsWith('5')) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith('9665')) {
    local = digits.slice(3);
  } else if (digits.length === 13 && digits.startsWith('09665')) {
    // `+09665…` — uncommon but seen when copy-paste includes a stray 0.
    local = digits.slice(4);
  }

  if (!local) return null;
  return `+966${local}`;
}

/** True iff `toE164Saudi` would succeed — useful for cheap predicates. */
export function isSaudiMobile(input: string): boolean {
  return toE164Saudi(input) !== null;
}
