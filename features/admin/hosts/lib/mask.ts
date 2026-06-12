/**
 * Mask sensitive identifiers for display on operational admin
 * surfaces (already-approved hosts, audit lists, etc.).
 *
 * Saudi national IDs and CR numbers are 10 digits each. We keep the
 * last 4 visible — enough for an admin to disambiguate against a
 * known number, but a leaked screenshot doesn't expose the full ID.
 *
 * Verification surfaces (`/admin/host-applications/[id]`) intentionally
 * render the raw value: matching the submitted document is the whole
 * point of that page. Anywhere post-approval should call this helper.
 *
 * The mask uses the bullet glyph (•) rather than `*` so it reads
 * cleanly in both `dir="ltr"` and `dir="rtl"` contexts without
 * forcing a digit-shape switch.
 */
const VISIBLE_TAIL = 4;
const MASK_CHAR = '•';

/**
 * Mask an IBAN for display: country prefix + last 4, e.g. `SA••••4523`.
 * The full value travels only into the copy-to-clipboard affordance —
 * a leaked screenshot of the payouts page doesn't expose bank details.
 */
export function maskIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replaceAll(/\s+/g, '');
  if (compact.length === 0) return null;
  if (compact.length <= 6) return compact;
  return `${compact.slice(0, 2)}${MASK_CHAR.repeat(4)}${compact.slice(-4)}`;
}

export function maskIdentityNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Short numbers (e.g. test fixtures) — show one digit max, mask the rest.
  if (trimmed.length <= VISIBLE_TAIL) {
    const visible = trimmed.slice(-1);
    return `${MASK_CHAR.repeat(Math.max(0, trimmed.length - 1))}${visible}`;
  }
  const tail = trimmed.slice(-VISIBLE_TAIL);
  const head = MASK_CHAR.repeat(trimmed.length - VISIBLE_TAIL);
  return `${head}${tail}`;
}
