import { maskIban, maskIdentityNumber } from '@/features/admin/hosts/lib/mask';

/**
 * Field-level audit values are stored MASKED for anything sensitive
 * (BRIEF §6 / PII posture) — the trail records THAT a value changed and
 * by whom, never a second cleartext copy of the ID or bank number. The
 * dotted field keys below are the ones the edit actions emit.
 */
const SENSITIVE_FIELDS = new Set([
  'guest.phone',
  'guest.email',
  'host.payoutIban',
  'host.nationalId',
  'host.crNumber',
]);

/** Mask an email to `a•••@domain` — enough to recognise, not to leak. */
function maskEmail(raw: string): string {
  const at = raw.indexOf('@');
  if (at <= 0) return '•••';
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, local.length - 1))}${domain}`;
}

/** Mask a phone to country/last-4, e.g. `+966••••1234`. */
function maskPhone(raw: string): string {
  const compact = raw.replaceAll(/\s+/g, '');
  if (compact.length <= 4) return '•'.repeat(compact.length);
  const head = compact.startsWith('+') ? compact.slice(0, 4) : compact.slice(0, 2);
  return `${head}${'•'.repeat(4)}${compact.slice(-4)}`;
}

/**
 * Reduce a stored value to what is safe to keep in the audit log for a
 * given field. Non-sensitive fields are stored verbatim (trimmed);
 * empty becomes null.
 */
export function maskAuditValue(field: string, value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (!SENSITIVE_FIELDS.has(field)) return trimmed;
  if (field === 'guest.email') return maskEmail(trimmed);
  if (field === 'guest.phone') return maskPhone(trimmed);
  if (field === 'host.payoutIban') return maskIban(trimmed);
  // host.nationalId / host.crNumber
  return maskIdentityNumber(trimmed);
}

export interface FieldChange {
  field: string;
  previous: string | null;
  next: string | null;
}

/**
 * Diff two flat records of the SAME keys and return one change per key
 * whose value actually moved. Values are compared as trimmed strings so
 * a no-op resubmit writes nothing.
 */
export function diffFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(after)) {
    const prev = before[key]?.trim() ?? '';
    const next = after[key]?.trim() ?? '';
    if (prev !== next) {
      changes.push({ field: key, previous: before[key] ?? null, next: after[key] ?? null });
    }
  }
  return changes;
}
