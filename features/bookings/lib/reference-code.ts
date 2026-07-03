/**
 * Short human booking reference — `GH-` + 6 chars from an unambiguous
 * alphabet (no 0/O, 1/I/L, or U to avoid misreadings when spoken,
 * screenshotted, or hand-copied). ~730M combinations; uniqueness is
 * enforced by the DB constraint, and at marketplace scale a collision
 * is a lottery ticket — the insert's error path covers it.
 *
 * This is the booking's *display* identity (confirmation page, /me,
 * support conversations). URLs and lookups keep the unguessable
 * `idempotencyKey` UUID capability — a reference a guest reads out
 * loud must never be enough to open the booking page.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 6;

export function generateReferenceCode(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return `GH-${code}`;
}
