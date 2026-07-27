-- Run this once in Supabase Dashboard -> SQL Editor (after products.sql,
-- orders.sql). Safe to re-run (idempotent).
--
-- Coupon codes are validated and applied server-side only (validate-coupon /
-- create-checkout-session, both service-role) - never listed to anonymous
-- or regular authenticated clients, only to admins (products_select_admin's
-- sibling policy below), so a shopper can never enumerate valid codes.

create table if not exists public.coupons (
  code text primary key,
  type text not null check (type in ('pct', 'flat')),
  val numeric(10,2) not null,
  active boolean not null default true,
  usage_limit int,
  usage_count int not null default 0,
  expires_at date,
  scope text not null default 'sitewide' check (scope in ('sitewide', 'platform', 'category')),
  platform text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

do $$ begin
  create policy "coupons_select_admin" on public.coupons
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- orders needs to remember which code (if any) was used on it, for the
-- admin coupon panel's usage stats and for customer-facing order history.
alter table public.orders add column if not exists coupon_code text;
