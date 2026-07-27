-- Run this once in Supabase Dashboard -> SQL Editor (after products.sql)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  currency text not null default 'usd',
  subtotal_usd numeric(10,2) not null,
  discount_usd numeric(10,2) not null default 0,
  total_usd numeric(10,2) not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.orders enable row level security;

-- Buyers can read their own orders. No insert/update/delete policy is added:
-- only the service role (used inside the Edge Functions) ever writes here.
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_slug text not null,
  title text not null,
  licence text not null default 'standard' check (licence in ('standard', 'resell')),
  unit_price_usd numeric(10,2) not null,
  qty int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

-- Same lockdown as orders: readable only by the owning buyer, via the
-- parent order's user_id. No client write policy.
create policy "order_items_select_own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_slug_idx on public.order_items(product_slug);
