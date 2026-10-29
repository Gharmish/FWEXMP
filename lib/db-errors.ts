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
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  return hasPgCode(error, '23505', constraintName);
}

/** Serialization failure / deadlock — the statement is safe to retry. */
export function isRetryableTxError(error: unknown): boolean {
  return hasPgCode(error, '40001') || hasPgCode(error, '40P01');
}

/**
 * Walk the cause chain for a postgres error with this code — and, when
 * given, this constraint (postgres.js exposes it as `constraint_name`),
 * so an unrelated collision on the same table still reads as a failure.
 */
function hasPgCode(error: unknown, code: string, constraintName?: string): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: unknown; constraint_name?: unknown };
    if (
      pg.code === code &&
      (constraintName === undefined || pg.constraint_name === constraintName)
    ) {
      return true;
    }
  }
  return false;
}
