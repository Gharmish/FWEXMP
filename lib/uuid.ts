/**
 * One UUID shape for every action and query that gates on an id before
 * it reaches SQL (2026-09 engineering audit ACTIONS-08 — six private
 * copies). zod schemas use `z.uuid()`; this is for the hand-rolled
 * guards on cookies and search params.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
