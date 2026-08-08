-- 2026-08-08 — follow-up to 2026-08-08-rename-faisal-host-slug.sql.
--
-- After the host row was re-slugged to abdulaziz-alasmari, its photo still
-- lived under the old persona's storage prefix. Moved the object and
-- repointed photo_url so the storage layout matches the slug.
--
-- The object move itself is NOT expressible as SQL: Supabase stores the file
-- in S3 under a VERSIONED key ({bucket}/{name}/{version}), so renaming the
-- storage.objects row would leave the row pointing at nothing. It was done
-- through the Storage API with the service-role key:
--
--   POST /storage/v1/object/copy
--     {"bucketId":"photos",
--      "sourceKey":"hosts/faisal-al-qahtani/profile.jpg",
--      "destinationKey":"hosts/abdulaziz-alasmari/profile.jpg"}
--   -- then, only after photo_url was repointed and verified live:
--   DELETE /storage/v1/object/photos/hosts/faisal-al-qahtani/profile.jpg
--
-- Copy-then-delete (rather than /object/move) so the live photo never 404s
-- mid-operation. Verified end to end on gharmish.com before the delete:
-- host page + /hosts directory referenced only the new key, and the
-- next/image optimized fetch returned 200.
--
-- NOTE: hosts/faisal-al-qahtani/avatar.jpg is deliberately LEFT IN PLACE —
-- it is the May seed-era image that features/*/lib/sample-data.ts points at
-- for the fictional Faisal persona used by the no-DB dev fallback. Deleting
-- it would break local dev; it is not the live host's photo.
--
-- The public URL carries a ?v=<epoch-ms> cache-buster, refreshed here so
-- CDN/browser caches refetch. Supabase public objects are CDN-cached for an
-- hour, so the deleted old URL keeps returning 200 until that expires —
-- append a query string to confirm the real state (it returns 400).

UPDATE hosts
SET photo_url = 'https://xjgpflzkpydfpuomqhuq.supabase.co/storage/v1/object/public/photos/hosts/abdulaziz-alasmari/profile.jpg?v='
                || (extract(epoch from now()) * 1000)::bigint::text
WHERE id = 'b01f2d2d-3946-48a6-bdc6-8559acaa7758'
  AND photo_url LIKE '%hosts/faisal-al-qahtani/profile.jpg%';
