-- Avatars storage bucket + RLS policies (guest profile photos).
--
-- Storage config lives outside Drizzle's schema, so this is applied
-- separately (Supabase SQL editor, MCP apply_migration, or psql) — it is
-- NOT picked up by `pnpm db:push`. Idempotent: safe to re-run.
--
-- Object key convention (set by features/account/profile/actions.ts):
--   avatars/<auth.uid()>/<uuid>.<ext>
-- Every policy scopes writes/reads to the user's own auth.uid() folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public reads are served by the public-bucket CDN endpoint. The SELECT
-- policy below is still required so the authenticated storage API can
-- locate an object before deleting it (remove() does SELECT then DELETE)
-- and so list() works — both scoped to the user's own folder.
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
