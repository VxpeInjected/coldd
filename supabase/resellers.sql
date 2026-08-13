-- Run this once in Supabase Dashboard -> SQL Editor (or `supabase db query --linked
-- --file supabase/resellers.sql`). Safe to re-run (idempotent).
--
-- Tracks who's reselling coldd products under a resell licence, and where.
-- Rows come from two sources: the post-purchase onboarding popup
-- (source='purchase', submit-reseller-info, one row per resell order_item -
-- the unique index keeps a re-submitted popup from creating duplicates) and
-- manual onboarding of resellers who bought before this system existed
-- (source='manual', admin-resellers).

create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  email text,
  display_name text,
  selling_where text not null,
  selling_notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text not null default 'purchase' check (source in ('purchase', 'manual')),
  created_at timestamptz not null default now()
);

create unique index if not exists resellers_order_item_id_key on public.resellers(order_item_id) where order_item_id is not null;
create index if not exists resellers_product_id_idx on public.resellers(product_id);

alter table public.resellers enable row level security;

-- No client policies - the purchase popup writes through submit-reseller-info
-- and admin management through admin-resellers, both service role. Nothing
-- reads or writes this table directly from the browser.
