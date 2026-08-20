-- Gift-at-checkout: orders.user_id keeps meaning "who owns/receives this"
-- (every ownership check, RLS policy, and dashboard query already keys off
-- it and must keep working unmodified for the recipient). This adds a
-- separate, nullable column for who actually paid, only ever set on gift
-- orders - purchased_by_user_id IS NOT NULL is itself the "this is a gift"
-- flag, no separate boolean.
alter table public.orders add column if not exists purchased_by_user_id uuid references auth.users(id);
create index if not exists orders_purchased_by_idx on public.orders (purchased_by_user_id) where purchased_by_user_id is not null;

-- The payer needs to see (and, for Robux, verify) an order they placed as
-- a gift even though orders.user_id is the recipient, not them.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select
  using (auth.uid() = user_id or auth.uid() = purchased_by_user_id);
