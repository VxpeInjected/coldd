-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Lets signed-in admins (profiles.is_admin = true) read every order,
-- order_items row, and profile - not just their own (orders_select_own /
-- product_legal-style lockdown otherwise applies) - so the admin panel's
-- Orders/Refunds panels can actually list real purchases. Writes (marking
-- an order paid/refunded) still only ever happen through
-- admin-manage-order (service role) - this only adds read access.

alter table public.orders add column if not exists refund_reason text;

do $$ begin
  create policy "orders_select_admin" on public.orders
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "order_items_select_admin" on public.order_items
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_select_admin" on public.profiles
    for select using (
      exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin = true)
    );
exception when duplicate_object then null;
end $$;
