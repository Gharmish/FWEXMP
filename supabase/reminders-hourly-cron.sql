-- Hourly trigger for the release-holds maintenance endpoint.
--
-- Vercel Cron runs /api/cron/release-holds only DAILY on the Hobby plan,
-- but the guest reminders (Pass 3 of that route) need ~hourly granularity
-- to hit their ~24h and ~3h pre-start offsets. This job calls the same
-- endpoint hourly from inside Supabase, so no Vercel plan upgrade is
-- needed. The route is idempotent and guarded by state + per-booking
-- dedupe flags (reminderSentAt / finalReminderSentAt), so the extra runs
-- alongside the daily Vercel run never conflict or double-send.
--
-- Applied once against the gharmish-experiences project via the Supabase
-- MCP (NOT drizzle — this is operational infra, not app schema). Kept here
-- for review and reproducibility.
--
-- The CRON_SECRET is read from Supabase Vault so it never lives in this
-- file or in the plaintext cron.job command. Add it once (value copied
-- from the Vercel env var of the same name):
--
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
--
-- Verify the production URL below matches the deployed origin.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'release-holds-hourly') then
    perform cron.unschedule('release-holds-hourly');
  end if;
end $$;

select cron.schedule(
  'release-holds-hourly',
  '0 * * * *',
  $job$
  select net.http_get(
    url     := 'https://gharmish.com/api/cron/release-holds',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $job$
);
