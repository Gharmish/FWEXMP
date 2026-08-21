-- 2026-08-21 — stuck-backend watchdog (runs INSIDE Postgres via pg_cron).
--
-- Failure it clears: after a Vercel function freeze, postgres-js can leave
-- a pooled backend `active` + waiting on `ClientRead` with a transaction
-- open — a half-sent protocol message the client will never finish. The
-- backend holds its Supavisor slot forever; every statement queued behind
-- it hits statement_timeout (57014), and /admin degrades to its "needs a
-- database connection" notice. Seen 2026-08-21 twice within 10 minutes;
-- until now an operator ran pg_terminate_backend by hand (runbook in the
-- admin-dashboard-metrics memory).
--
-- Why pg_cron and not an app route: the app's own pool is the thing that
-- is poisoned, so a sweeper behind it could not be relied on to run.
--
-- Scope is deliberately narrow — only the app role, only the
-- contradictory `active`+`ClientRead` state (a healthy active backend is
-- never waiting on the client) older than 45s, plus `idle in transaction`
-- older than 2 minutes (nothing in the app holds a transaction that long).
-- Each kill is logged so the dashboard/ops can see how often it fires.
--
-- Applied to gharmish-experiences via Supabase MCP apply_migration.

create table if not exists backend_watchdog_log (
  id           bigint generated always as identity primary key,
  killed_at    timestamptz not null default now(),
  pid          integer not null,
  usename      text,
  state        text,
  wait_event   text,
  xact_age     interval,
  query        text
);

comment on table backend_watchdog_log is
  'Backends terminated by terminate_stuck_app_backends() (pg_cron, every minute). Read-only audit trail.';

create or replace function terminate_stuck_app_backends()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  killed integer := 0;
  r record;
begin
  for r in
    select pid, usename, state, wait_event, now() - xact_start as xact_age, query
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and backend_type = 'client backend'
      and usename = 'gharmish_app'
      and (
        (state = 'active' and wait_event = 'ClientRead' and now() - xact_start > interval '45 seconds')
        or
        (state = 'idle in transaction' and now() - xact_start > interval '2 minutes')
      )
  loop
    if pg_terminate_backend(r.pid) then
      insert into backend_watchdog_log (pid, usename, state, wait_event, xact_age, query)
      values (r.pid, r.usename, r.state, r.wait_event, r.xact_age, left(r.query, 500));
      killed := killed + 1;
    end if;
  end loop;
  return killed;
end;
$$;

revoke all on function terminate_stuck_app_backends() from public;

-- Keep the log small: 30 days is plenty for trend-spotting.
create or replace function prune_backend_watchdog_log()
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  delete from backend_watchdog_log where killed_at < now() - interval '30 days';
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stuck-backend-watchdog') then
    perform cron.unschedule('stuck-backend-watchdog');
  end if;
  if exists (select 1 from cron.job where jobname = 'stuck-backend-watchdog-prune') then
    perform cron.unschedule('stuck-backend-watchdog-prune');
  end if;
end $$;

select cron.schedule('stuck-backend-watchdog', '* * * * *', $job$ select terminate_stuck_app_backends(); $job$);
select cron.schedule('stuck-backend-watchdog-prune', '15 4 * * *', $job$ select prune_backend_watchdog_log(); $job$);
