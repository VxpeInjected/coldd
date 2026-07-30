-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Pool of Roblox "container" experiences that gamepasses get created in.
-- Roblox caps a universe at 50 gamepasses and has no API to create new
-- experiences, so admins pre-create empty ones manually (in Roblox
-- Studio, then add them to their Open Cloud API key's game-passes
-- permission list at create.roblox.com/dashboard/credentials) and
-- register the Universe ID here. admin-upsert-product hard-blocks
-- creating new Roblox products once every active container is full.

create table if not exists public.roblox_containers (
  id uuid primary key default gen_random_uuid(),
  universe_id text not null unique,
  label text,
  gamepass_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.roblox_containers enable row level security;

do $$ begin
  create policy "roblox_containers_select_admin" on public.roblox_containers
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy - writes only ever happen through
-- admin-upsert-roblox-container / admin-upsert-product (service role).

-- Atomic increment so two concurrent product creations can't both read
-- the same gamepass_count and overshoot the 50-per-universe limit - the
-- WHERE gamepass_count < 50 makes the increment itself conditional, not
-- just the earlier pickContainer() read.
create or replace function public.increment_roblox_container(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.roblox_containers
  set gamepass_count = gamepass_count + 1
  where id = p_id and gamepass_count < 50;
$$;
