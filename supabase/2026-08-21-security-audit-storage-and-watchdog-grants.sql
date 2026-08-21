-- 2026-08-21 — security audit remediation: H2, M1, M2.
--
-- Three findings from docs/security/security-audit-2026-08-21.md, all of
-- them grants/policy mistakes rather than code defects. Nothing here
-- touches application behaviour; each statement only takes away a
-- privilege nothing legitimate uses. See the evidence notes on each
-- section — every "nothing uses this" claim below was checked against
-- the live database, not assumed.
--
-- Apply via the Supabase MCP `apply_migration` (db:push drifts — see the
-- drizzle-push-drift note), then run the VERIFY block at the bottom.
--
-- NOT included on purpose: moving `pg_net` out of the `public` schema
-- (advisor WARN, carried from the 2026-08-02 audit). Both operational
-- cron jobs call `net.http_get`, including the watchdog that pages the
-- operator when the heartbeat dies, so relocating the extension is a
-- change that can silence the alarm rail. It does not belong in the same
-- migration as three statements that cannot fail — it wants its own
-- change window with the cron jobs re-verified afterwards.

-- Every statement is idempotent and independently safe, so there is no
-- explicit transaction block — `apply_migration` supplies its own, and a
-- nested BEGIN trips some drivers. Re-running this file is a no-op.

-- ---------------------------------------------------------------------
-- H2 (High) — the `photos` bucket is writable by ANY signed-in user.
-- ---------------------------------------------------------------------
-- The two policies below scope on `auth.role() = 'authenticated'` and
-- nothing else: no path predicate, unlike the `avatars` and
-- `kyc-documents` policies which both pin
-- `(storage.foldername(name))[1] = auth.uid()`. Object keys are
-- predictable and public (`experiences/{slug}/hero.{ext}`,
-- `hosts/{slug}/profile.{ext}`, slugs are in the sitemap), so any guest
-- who completes a phone OTP holds an `authenticated` JWT and can
-- overwrite every image on the live storefront. The UPDATE policy also
-- carries a `qual` with no `with_check`.
--
-- Why dropping them outright is the right fix rather than scoping them:
-- `getSupabaseUserStorage()` returns a SERVICE-ROLE client whenever
-- `SUPABASE_SERVICE_ROLE_KEY` is set, and service role bypasses storage
-- RLS entirely — so in production these policies are already dead code.
-- Evidence from `storage.objects.owner_id` (null = service role, set =
-- user token) on the day of the audit:
--
--     photos / service_role   16 objects   2026-05-22 .. 2026-08-18
--     photos / user_token      6 objects   2026-05-22 .. 2026-05-29
--
-- The user-token path last wrote on 2026-05-29, before the 2026-07-03
-- switch to the service-role client. Every write for the last three
-- months went around these policies.
--
-- They also cannot usefully be scoped: the key convention is
-- `experiences/{slug}/…`, not `{auth.uid()}/…`, so a uid-folder
-- predicate would reject the app's own keys. Ownership lives in
-- `public.experiences`/`public.hosts`, which are RLS-deny-all, so a
-- subquery evaluated as `authenticated` returns nothing. A correct
-- scoped policy would need SECURITY DEFINER helpers — real complexity
-- inside a security policy, in exchange for a path production does not
-- take.
--
-- LOCAL DEV CONSEQUENCE — read before applying: dev has no
-- `SUPABASE_SERVICE_ROLE_KEY` in `.env`/`.env.local`, so it takes the
-- user-token fallback and photo uploads from `pnpm dev` will start
-- failing with "new row violates row-level security policy" once these
-- are gone. The fix is one line in `.env.local` (the service-role key
-- from the Supabase dashboard), which ALSO makes dev exercise the same
-- storage path as production. That divergence is worth closing on its
-- own: a dev-only fallback is exactly why a world-writable policy on
-- the live bucket survived this long unnoticed.

drop policy if exists photos_authenticated_write on storage.objects;
drop policy if exists photos_authenticated_update on storage.objects;

-- The `avatars` and `kyc-documents` policies are deliberately untouched:
-- both are already scoped to the uploader's own uid folder and are
-- correct as they stand.

-- ---------------------------------------------------------------------
-- M1 (Medium) — `backend_watchdog_log` is world readable AND writable.
-- ---------------------------------------------------------------------
-- Supabase advisor ERROR `rls_disabled_in_public`. The table shipped in
-- 2026-08-21-stuck-backend-watchdog.sql without `enable row level
-- security`, so PostgREST exposes it to the publishable anon key that
-- ships in the client bundle. Confirmed on the live database:
-- anon holds SELECT, INSERT and DELETE.
--
-- It holds 0 rows today, so nothing has leaked. The write grants matter
-- more than the read one: this is the audit trail of which backends the
-- watchdog killed, and an anonymous caller can currently forge or erase
-- entries in it.
--
-- Deny-by-default (RLS on, no policies) matches the other 36 tables in
-- this schema. Safe for the writer: the table is owned by `postgres`
-- with `FORCE ROW LEVEL SECURITY` off, and the only inserter is
-- `terminate_stuck_app_backends()`, a SECURITY DEFINER function owned by
-- `postgres` — the owner is exempt from RLS, so the cron job keeps
-- logging. `gharmish_app` is BYPASSRLS and untouched here; no
-- application code reads this table (grep-verified).

alter table public.backend_watchdog_log enable row level security;
revoke all on table public.backend_watchdog_log from anon, authenticated;

comment on table public.backend_watchdog_log is
  'Backends terminated by terminate_stuck_app_backends() (pg_cron, every minute). Read-only audit trail. RLS on with no policies (deny-by-default) — reachable only by the BYPASSRLS app role and the SECURITY DEFINER writer; never expose to anon/authenticated.';

-- ---------------------------------------------------------------------
-- M2 (Medium) — both watchdog functions are callable by `anon`.
-- ---------------------------------------------------------------------
-- Supabase advisor WARN ×4. `terminate_stuck_app_backends()` is an
-- unauthenticated call into `pg_terminate_backend` via
-- `/rest/v1/rpc/…`, and `prune_backend_watchdog_log()` lets anyone
-- delete audit rows older than 30 days.
--
-- The original migration's `revoke all on function … from public` did
-- not help, and this is the trap worth remembering: Supabase's default
-- privileges grant EXECUTE to `anon` and `authenticated` EXPLICITLY, and
-- revoking from PUBLIC leaves those direct grants standing. The roles
-- have to be named. `prune_backend_watchdog_log()` had no revoke at all.
--
-- Blast radius was bounded — the kill predicate only matches stuck
-- `gharmish_app` backends (active+ClientRead >45s, or idle-in-transaction
-- >2min), never a healthy connection — which is why this is Medium and
-- not a remote DoS. Bounded is not the same as intended.
--
-- Safe for the scheduler: both cron jobs run as `postgres`, which owns
-- both functions, and an owner's own EXECUTE is not affected by revoking
-- from other roles.

revoke execute on function public.terminate_stuck_app_backends() from public, anon, authenticated;
revoke execute on function public.prune_backend_watchdog_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- VERIFY — run after applying. Every row must read `true`.
-- ---------------------------------------------------------------------
-- select 'photos policies gone' as check,
--        not exists (
--          select 1 from pg_policies
--          where schemaname = 'storage' and tablename = 'objects'
--            and policyname in ('photos_authenticated_write', 'photos_authenticated_update')
--        ) as ok
-- union all
-- select 'avatars + kyc policies intact',
--        (select count(*) from pg_policies
--         where schemaname = 'storage' and tablename = 'objects'
--           and policyname like any (array['avatars_%', 'kyc_%'])) = 8
-- union all
-- select 'watchdog log rls on',
--        (select rowsecurity from pg_tables
--         where schemaname = 'public' and tablename = 'backend_watchdog_log')
-- union all
-- select 'watchdog log denies anon',
--        not has_table_privilege('anon', 'public.backend_watchdog_log', 'SELECT')
--        and not has_table_privilege('anon', 'public.backend_watchdog_log', 'INSERT')
--        and not has_table_privilege('anon', 'public.backend_watchdog_log', 'DELETE')
-- union all
-- select 'terminate fn denies anon + authenticated',
--        not has_function_privilege('anon', 'public.terminate_stuck_app_backends()', 'EXECUTE')
--        and not has_function_privilege('authenticated', 'public.terminate_stuck_app_backends()', 'EXECUTE')
-- union all
-- select 'prune fn denies anon + authenticated',
--        not has_function_privilege('anon', 'public.prune_backend_watchdog_log()', 'EXECUTE')
--        and not has_function_privilege('authenticated', 'public.prune_backend_watchdog_log()', 'EXECUTE')
-- union all
-- select 'cron owner still holds execute',
--        has_function_privilege('postgres', 'public.terminate_stuck_app_backends()', 'EXECUTE')
--        and has_function_privilege('postgres', 'public.prune_backend_watchdog_log()', 'EXECUTE');
--
-- Then confirm the watchdog still logs: within a few minutes of a real
-- kill, `select count(*) from backend_watchdog_log` must be able to grow.
-- To exercise it without waiting, call the function as postgres from the
-- SQL editor: `select terminate_stuck_app_backends();` — it returns the
-- number killed (0 on a healthy pool, which is the expected answer).
