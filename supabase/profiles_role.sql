-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Real staff role tier, on top of the existing is_admin flag (which stays
-- the actual RLS/Edge-Function access gate - this just distinguishes
-- owner/admin/support for admin-panel permission checks). Set manually for
-- now, e.g.:
--   update public.profiles set role = 'owner' where discord_id = '...';

alter table public.profiles add column if not exists role text check (role in ('owner', 'admin', 'support'));

-- Give the existing admins (seeded is_admin=true in profiles_admin_seed.sql)
-- an explicit role so the admin panel's permission checks have something
-- real to read immediately. Adjust which one should be 'owner' as needed.
update public.profiles set role = 'owner' where is_admin = true and role is null;
