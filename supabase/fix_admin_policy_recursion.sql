-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- Fixes "infinite recursion detected in policy for relation profiles"
-- (Postgres error 42P17). Root cause: profiles_select_admin (added in
-- orders_admin.sql) is a policy ON profiles whose USING clause SELECTs
-- FROM profiles again - Postgres has to apply RLS to that inner SELECT
-- too, which re-expands the same policy, forever. This isn't limited to
-- profiles itself: every OTHER "admin can read everything" policy
-- (products_select_admin, product_legal_select_admin, coupons_select_admin,
-- orders_select_admin, order_items_select_admin, roblox_containers_select_admin)
-- subqueries profiles the same way, so as soon as profiles_select_admin
-- existed, ALL of them started hitting this recursion too - not just the
-- table that happened to surface it first.
--
-- Fix: a SECURITY DEFINER helper function. Functions created here are
-- owned by the `postgres` role, which bypasses RLS - so is_admin()'s own
-- query against profiles does not re-trigger profiles' policies, breaking
-- the cycle. Every affected policy is dropped and recreated to call this
-- function instead of repeating the inline subquery.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

drop policy if exists "products_select_admin" on public.products;
create policy "products_select_admin" on public.products
  for select using (public.is_admin());

drop policy if exists "product_legal_select_admin" on public.product_legal;
create policy "product_legal_select_admin" on public.product_legal
  for select using (public.is_admin());

drop policy if exists "coupons_select_admin" on public.coupons;
create policy "coupons_select_admin" on public.coupons
  for select using (public.is_admin());

drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin" on public.orders
  for select using (public.is_admin());

drop policy if exists "order_items_select_admin" on public.order_items;
create policy "order_items_select_admin" on public.order_items
  for select using (public.is_admin());

drop policy if exists "roblox_containers_select_admin" on public.roblox_containers;
create policy "roblox_containers_select_admin" on public.roblox_containers
  for select using (public.is_admin());
