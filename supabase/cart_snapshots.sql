-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.
--
-- Backs the admin "Abandoned carts" panel. A row is saved when someone
-- reaches checkout with items in their cart; deleted once they actually
-- place an order (Stripe session created or a Robux order created) or
-- once their cart is empty. Anything left over is, by definition, an
-- abandoned cart.

create table if not exists public.cart_snapshots (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  items jsonb not null default '[]'::jsonb,
  value_usd numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cart_snapshots enable row level security;

drop policy if exists "cart_snapshots_select_admin" on public.cart_snapshots;
create policy "cart_snapshots_select_admin" on public.cart_snapshots
  for select using (public.is_admin());

-- No client read/write policy - writes go through save-cart-snapshot /
-- delete-cart-snapshot (service role, no auth required so it works for
-- signed-out shoppers too).

create index if not exists cart_snapshots_updated_at_idx on public.cart_snapshots(updated_at);
