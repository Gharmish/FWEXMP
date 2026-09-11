/**
 * Postgres error classification shared by every writer that races on a
 * unique constraint (2026-09 engineering audit ACTIONS-08 — four private
 * copies, three of which only looked at the top-level `code`).
 *
 * drizzle-orm ≥0.44 wraps driver failures in `DrizzleQueryError` and
 * keeps the postgres error on `cause`, so the check has to walk the
 * cause chain — a top-level `code === '23505'` test silently reports
 * every unique violation as a generic server error.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasPgCode(error, '23505');
}

/** Serialization failure / deadlock — the statement is safe to retry. */
export function isRetryableTxError(error: unknown): boolean {
  return hasPgCode(error, '40001') || hasPgCode(error, '40P01');
}

function hasPgCode(error: unknown, code: string): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === code) return true;
  }
  return false;
}
