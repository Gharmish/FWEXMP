-- 2026-08-22: host-dashboard audit remediation (HOST_DASHBOARD_AUDIT.md).
-- ALREADY APPLIED to the live gharmish-experiences project via Supabase MCP
-- apply_migration on 2026-08-22; kept here so repo, live schema and the
-- Supabase migration history agree. Idempotent — safe to re-run.
--
--   * cancellation_kind gains 'host' (P1-4): host-initiated cancellations
--     were stamped 'operator', indistinguishable from ops cancellations.
--   * bookings.guest_note (P1-3): the guest's message to the host at the
--     request step.
--   * reviews.host_replied_at (P2-8): lets the host edit a reply for 24h.

alter type cancellation_kind add value if not exists 'host';

alter table bookings
  add column if not exists guest_note text;

alter table reviews
  add column if not exists host_replied_at timestamptz;
