-- Both tables are only ever read/written by Edge Functions via the
-- service-role client (see _shared/roblox_pool.ts) - never by the anon or
-- authenticated client. Service role bypasses RLS entirely, so enabling
-- it with zero policies blocks direct anon/authenticated access via the
-- public API without breaking anything that actually uses these tables.
-- Flagged by Supabase Advisor as public tables with RLS disabled.
alter table public.roblox_owned_passes enable row level security;
alter table public.roblox_pass_switches enable row level security;
