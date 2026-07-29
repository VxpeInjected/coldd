-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists ban_reason text;
