-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires roblox_group_revenue_ledger.sql to already
-- exist.
--
-- Lets the admin panel read individual transactions (not just the
-- all-time rollup) so the date-range selector (24h/7D/30D/All) can
-- actually filter Robux revenue by real transaction timestamps, instead
-- of only ever showing the flat all-time total.

drop policy if exists "roblox_group_transactions_select_admin" on public.roblox_group_transactions;
create policy "roblox_group_transactions_select_admin" on public.roblox_group_transactions
  for select using (public.is_admin());
