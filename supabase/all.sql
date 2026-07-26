-- Run this once in Supabase Dashboard -> SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for anything that isn't naturally idempotent.

-- 1. Base profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text,
  username text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Extra columns added along the way
alter table public.profiles add column if not exists guilds jsonb;
alter table public.profiles add column if not exists member_info jsonb;
alter table public.profiles add column if not exists email_verified boolean not null default false;

-- 3. RLS on profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- 4. Email OTP table (only the Edge Function's service role touches this)
create table if not exists public.email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.email_otps enable row level security;

-- 5. email_exists RPC, used by sign-in to distinguish "no account" from "wrong password"
create or replace function public.email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from auth.users where email = check_email);
$$;

grant execute on function public.email_exists(text) to anon, authenticated;
