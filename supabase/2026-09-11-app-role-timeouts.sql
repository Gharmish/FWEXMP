-- 2026-09 engineering audit DATA-06: server-side guard rails on the app
-- role. Until now a runaway statement was only ever cleaned up by the
-- pg_cron "killer" job, minutes later, while it held a pooled connection
-- from a 5-connection pool. These settings make Postgres itself abort a
-- statement that outlives every application deadline (lib/deadline.ts
-- allows 8s + one retry; the cron passes are budgeted per pass) and
-- release a transaction left idle by a crashed function.
--
-- Apply once, as the postgres owner, via the Supabase SQL editor or MCP
-- apply_migration. Role settings take effect on the next connection.
alter role gharmish_app set statement_timeout = '30s';
alter role gharmish_app set idle_in_transaction_session_timeout = '60s';
alter role gharmish_app set lock_timeout = '10s';
