-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Mirrors discord_id's pattern: a display/identity column on profiles
-- (readable by the owning user via the existing profiles_select_own
-- policy) separate from roblox_accounts, which holds the actual OAuth
-- tokens and has no client access at all.

alter table public.profiles add column if not exists roblox_id text;
