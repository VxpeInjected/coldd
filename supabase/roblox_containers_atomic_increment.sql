-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent - just replaces the function).
--
-- increment_roblox_container previously did a plain unconditional
-- UPDATE ... SET gamepass_count = gamepass_count + 1, with the actual
-- <50 cap only checked earlier by pickContainer()'s SELECT
-- (_shared/roblox.ts). That's a check-then-act race: two concurrent
-- product saves (a double-clicked Save, or two admins working at once)
-- can both read the same container at gamepass_count=49, both pass the
-- <50 filter, and both increment - leaving gamepass_count at 51 in our
-- own tracking, permanently wrong for every future pickContainer() call
-- and the admin Roblox panel's displayed count.
--
-- Now the increment itself is conditional (WHERE gamepass_count < 50),
-- so gamepass_count can never exceed 50 in the database regardless of
-- concurrent calls, closing the data-integrity gap. The call site
-- already treats this as fire-and-forget/non-blocking (a Roblox
-- gamepass, once created, can't be deleted via their API - only
-- disabled - so there's nothing to roll back on the rare lost race
-- either way), so no Edge Function changes are needed alongside this.

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
