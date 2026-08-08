-- 2026-08-08 — Abdulaziz/Faisal host content consistency fix (applied via MCP).
--
-- The live host row b01f2d2d-3946-48a6-bdc6-8559acaa7758 was renamed at some
-- point from the seed persona "Faisal Al Qahtani" to the real owner
-- "Abdulaziz Alasmari" (name + both bios), but the public slug still carried
-- the old persona's name, so the profile lived at /hosts/faisal-al-qahtani.
--
-- This re-slugs the row; app-side, /hosts/faisal-al-qahtani now 301s to the
-- new slug (LEGACY_HOST_SLUGS in app/[locale]/hosts/[slug]/page.tsx) and
-- toArabicText gained the 'Abdulaziz Alasmari' → 'عبدالعزيز الأسمري' entry so
-- Arabic surfaces stop rendering the Latin name.
--
-- Deliberately NOT touched:
--   * db/seed.ts + features/*/lib/sample-data.ts keep the fictional Faisal
--     persona for the no-DB dev fallback.
--
-- Follow-up: the storage key was moved too, see
-- 2026-08-08-move-host-photo-storage-key.sql (this file originally recorded
-- photo_url as deliberately left on the old key; that is no longer true).

UPDATE hosts
SET slug = 'abdulaziz-alasmari'
WHERE id = 'b01f2d2d-3946-48a6-bdc6-8559acaa7758'
  AND slug = 'faisal-al-qahtani';
