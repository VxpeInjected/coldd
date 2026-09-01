-- Run this once in Supabase Dashboard -> SQL Editor

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  price_usd numeric(10,2) not null,
  resell_available boolean not null default false,
  was_price numeric(10,2),
  image text,
  description text,
  cat text,
  subcat text,
  platform text not null check (platform in ('Roblox', 'Minecraft')),
  page text not null default '/shop',
  reviews_count int not null default 0,
  rating numeric(2,1) not null default 0,
  storage_path text not null default '_shared/placeholder.zip',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

-- Public catalog is read-only to everyone. No write policy is added on
-- purpose: writes go through the service role only (manual SQL for now,
-- admin Edge Functions in a later phase).
create policy "products_select_active" on public.products
  for select using (is_active = true);
