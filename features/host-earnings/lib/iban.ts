/**
 * `SA•• •••• •••• •••• 1234` — enough to recognise, useless to copy.
 * Shared by the earnings page (display) and the IBAN audit trail
 * (which stores masked values only — the full IBAN never enters a log).
 */
export function maskIban(iban: string | null): string | null {
  if (!iban) return null;
  const tail = iban.slice(-4);
  return `SA${'•'.repeat(Math.max(0, iban.length - 6))}${tail}`;
}
