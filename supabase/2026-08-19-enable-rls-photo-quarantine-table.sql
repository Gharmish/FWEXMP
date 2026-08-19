-- Applied to prod via Supabase MCP apply_migration on 2026-08-19
-- (migration name: enable_rls_experience_photos_quarantine_20260815).
--
-- Why: the Supabase security advisor (email of 2026-08-18) flagged
-- `rls_disabled_in_public` on experience_photos_quarantine_20260815 —
-- the quarantine table created during the 2026-08-15 homepage photo
-- quarantine was made with a raw CREATE TABLE ... AS and never had RLS
-- enabled, leaving it readable/writable through the public PostgREST API.
--
-- Fix: enable RLS with no policies, matching the deny-by-default posture
-- of every other public table. The app is unaffected (it connects via the
-- gharmish_app BYPASSRLS role).

alter table public.experience_photos_quarantine_20260815 enable row level security;
