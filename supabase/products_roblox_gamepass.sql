-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).

alter table public.products add column if not exists roblox_gamepass_id text;
alter table public.products add column if not exists roblox_universe_id text;
