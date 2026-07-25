-- Run this once in Supabase Dashboard -> SQL Editor
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text,
  username text,
  email text,
  avatar_url text,
  guilds jsonb,
  member_info jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can only read/write their own profile row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
