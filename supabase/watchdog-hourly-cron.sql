-- Hourly trigger for the cron WATCHDOG endpoint (2026-08-02 ops audit
-- P0-7 — see app/api/cron/watchdog/route.ts for the full rationale).
--
-- The watchdog checks the release-holds heartbeat and PUSHES a stale
-- alert (email + WhatsApp rail) instead of waiting for someone to load
-- /admin and notice the banner. It must be scheduled separately from
-- the job it watches: this pg_cron entry runs at :30 (offset from the
-- release-holds job at :00 so a healthy stamp is at most ~30min old
-- when checked), and the Vercel Cron entry (vercel.json, daily 15:00)
-- backstops a total pg_cron outage within 24h.
--
-- Apply once against the gharmish-experiences project via the Supabase
-- MCP / SQL editor AFTER the /api/cron/watchdog route is deployed.
-- Reuses the same `cron_secret` Vault entry as release-holds-hourly —
-- no new secret needed. Verify the production URL matches the deployed
-- origin.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cron-watchdog-hourly') then
    perform cron.unschedule('cron-watchdog-hourly');
  end if;
end $$;

select cron.schedule(
  'cron-watchdog-hourly',
  '30 * * * *',
  $job$
  select net.http_get(
    url     := 'https://gharmish.com/api/cron/watchdog',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $job$
);
