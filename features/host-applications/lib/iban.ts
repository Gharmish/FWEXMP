/**
 * Saudi IBAN validation, kept pure so the same rule runs in the zod
 * schema (client + server action) and is unit-testable.
 *
 * SAMA format: `SA` + 2 check digits + 2-digit bank code + 18
 * alphanumeric BBAN characters — 24 characters total. Most real
 * accounts are all-digits after `SA`, but the standard allows letters
 * in the BBAN, so we accept them and let mod-97 be the gate.
 */

const SA_IBAN_SHAPE = /^SA\d{2}\d{2}[0-9A-Z]{18}$/;

/** Strip spaces (users paste `SA03 8000 …` from bank apps) and uppercase. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * ISO 13616 mod-97 check over a normalized IBAN. Digit-by-digit
 * remainder so we never overflow Number (a 24-char IBAN expands to a
 * ~30-digit integer).
 */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    // A→10 … Z→35; digits pass through as-is.
    const expanded = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of expanded) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder;
}

/** True when `iban` (already normalized) is a checksum-valid Saudi IBAN. */
export function isValidSaudiIban(iban: string): boolean {
  return SA_IBAN_SHAPE.test(iban) && ibanMod97(iban) === 1;
}
