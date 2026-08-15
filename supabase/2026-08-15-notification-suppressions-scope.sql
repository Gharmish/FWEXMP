-- Applied to prod via Supabase MCP `apply_migration` on 2026-08-15
-- (migration name: notification_suppressions_scope).
-- Marketing-audit remediation: suppression scope, added BEFORE the first
-- marketing send so a campaign unsubscribe ('marketing') can never kill a
-- guest's transactional delivery. Existing rows (STOP/bounce/complaint)
-- correctly default to 'all' — nothing is sent to them, as before.

alter table notification_suppressions add column if not exists scope text not null default 'all';
