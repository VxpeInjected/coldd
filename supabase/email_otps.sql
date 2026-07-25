-- Run this once in Supabase Dashboard -> SQL Editor
-- (in addition to the earlier profiles.sql)

alter table public.profiles add column if not exists email_verified boolean not null default false;

create table if not exists public.email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- Locked down: only the service role (used inside the Edge Function) touches
-- this table. No policies are added for anon/authenticated on purpose.
alter table public.email_otps enable row level security;
