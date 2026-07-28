-- Run in Supabase SQL Editor

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists full_name text;

-- Avatar storage bucket (public read, users can only write their own folder)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar_own_write" on storage.objects;
create policy "avatar_own_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_own_update" on storage.objects;
create policy "avatar_own_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_own_delete" on storage.objects;
create policy "avatar_own_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
