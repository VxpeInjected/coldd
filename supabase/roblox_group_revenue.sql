-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) and
-- roblox_cookie_health.sql (ROBLOX_FALLBACK_COOKIE/ROBLOX_GROUP_ID
-- already in use by the Phase D fallback) to already exist.
--
-- Backs the Robux group-transaction revenue scan: "Overall Robux revenue"
-- (every Sale transaction in the group's ledger - ground truth, a
-- superset of our own tracked website orders) and "Parcel revenue"
-- (transactions originating from the separate Roblox Parcel Hub game,
-- universe/place id 6156094414 - not one of our own products, so those
-- sales get logged as synthetic orders instead).

create table if not exists public.roblox_group_revenue (
  id boolean primary key default true,
  total_robux numeric not null default 0,
  parcel_robux numeric not null default 0,
  last_transaction_id text,
  updated_at timestamptz not null default now(),
  constraint roblox_group_revenue_singleton check (id)
);
insert into public.roblox_group_revenue (id) values (true) on conflict (id) do nothing;

alter table public.roblox_group_revenue enable row level security;

drop policy if exists "roblox_group_revenue_select_admin" on public.roblox_group_revenue;
create policy "roblox_group_revenue_select_admin" on public.roblox_group_revenue
  for select using (public.is_admin());

-- Marks which platform an order actually came from - 'website' (the
-- normal checkout flow) or 'parcel' (synthetic, created from a Parcel Hub
-- group transaction). external_transaction_id is the Roblox transaction
-- id, used to dedupe re-scans so the same sale never gets logged twice.
alter table public.orders add column if not exists source text not null default 'website';
alter table public.orders add column if not exists external_transaction_id text unique;

-- Synthetic Parcel orders aren't tied to one of our own catalog products,
-- so order_items.product_id can no longer be a hard requirement.
alter table public.order_items alter column product_id drop not null;
