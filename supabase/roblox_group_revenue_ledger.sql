-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires roblox_group_revenue.sql to already exist.
--
-- Fixes a double-counting bug in the original roblox-group-revenue-sync
-- design: total_robux/parcel_robux were plain running counters, updated
-- by adding "everything seen this call" on top of the stored total. When
-- a bootstrap run got rate-limited before reaching a stable stopping
-- point, repeated manual re-syncs re-summed largely the same overlapping
-- transactions instead of only genuinely new ones, inflating the total
-- far past reality (confirmed: showed R$22.7M against a real ~R$40-50k/
-- month business).
--
-- Fix: every individual Roblox Sale transaction is now recorded once in
-- this ledger, keyed by its own id, with `insert ... on conflict do
-- nothing`. No matter how many times or how overlapping the sync runs,
-- re-processing an already-seen transaction is a harmless no-op instead
-- of adding its amount again. total_robux/parcel_robux on
-- roblox_group_revenue become a cached rollup recomputed with SUM(),
-- not a hand-maintained counter.

create table if not exists public.roblox_group_transactions (
  id text primary key,
  amount numeric not null,
  is_parcel boolean not null default false,
  item_name text,
  created_at timestamptz not null
);

alter table public.roblox_group_transactions enable row level security;
-- Intentionally no client policies - service role (the Edge Function) only.

alter table public.roblox_group_revenue add column if not exists resume_cursor text;

-- The pre-fix totals were computed with the buggy accumulator and are
-- known wrong - reset them. The next sync rebuilds them correctly from
-- this ledger (starting from 0 and walking real history forward), and
-- last_transaction_id/resume_cursor reset too so it does a clean bootstrap.
update public.roblox_group_revenue
set total_robux = 0, parcel_robux = 0, last_transaction_id = null, resume_cursor = null
where id = true;
