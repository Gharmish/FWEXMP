-- Brand storytelling content model (2026-08-14 brand-narrative mandate;
-- see commit "feat(brand): scalable place-first positioning…" and the
-- rendering surfaces it added: experience detail "The story behind this
-- experience" and host profile "{name}'s story").
--
-- ALREADY APPLIED to the gharmish-experiences project via the Supabase
-- MCP as migration `add_story_fields_experiences_hosts` (recorded in
-- the project's migration history). Kept in-repo for reproducibility,
-- per the same convention as the other dated files here. Idempotent —
-- safe to re-run.
--
-- Design notes:
-- - Nullable by design: every surface renders the story section only
--   when real content exists (no-fabrication rule). NULL = hidden.
-- - Hosts author their own via /host/profile (80–2000 chars, blank
--   stores NULL). Experience stories are edited in the admin experience
--   editor (/admin/experiences/[id]/edit, same bounds — added the same
--   day, after the columns landed).
-- - Bilingual pair columns follow the existing *_en/*_ar convention;
--   the queries layer applies the TODO(ar) placeholder guard on read.

alter table experiences
  add column if not exists story_en text,
  add column if not exists story_ar text;

alter table hosts
  add column if not exists story_en text,
  add column if not exists story_ar text;
