-- Run this once in Supabase Dashboard -> SQL Editor (or `supabase db query --linked
-- --file supabase/unreleased_files.sql`). Safe to re-run (idempotent).
--
-- Staging area for files that need to become products eventually but
-- shouldn't be tracked as real (visible=false) product rows. Replaces the
-- old "Unreleased" product-status filter, which mixed half-finished
-- placeholder products into the real catalog. Files live in the existing
-- private product-files bucket under an "unreleased/" prefix; this table
-- just tracks the rename-able display name and upload metadata.

create table if not exists public.unreleased_files (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  storage_path text not null,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.unreleased_files enable row level security;

do $$ begin
  create policy "unreleased_files_select_admin" on public.unreleased_files
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy - only admin-unreleased-files (service role) writes.
