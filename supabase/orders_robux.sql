-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).

alter table public.orders add column if not exists roblox_gamepass_id text;
alter table public.orders add column if not exists roblox_buyer_id text;
alter table public.orders add column if not exists roblox_verification_method text;
alter table public.orders add column if not exists total_robux numeric(12,0);
