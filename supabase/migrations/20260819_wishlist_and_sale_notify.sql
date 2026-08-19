-- Wishlist was purely client-side (localStorage, coldd_wish_v1) - no server
-- ever knew what was on a signed-in user's wishlist, so nothing server-side
-- (a sale-price update, a notification trigger) could ever act on it. This
-- gives it a real, durable, per-user record. localStorage stays as the
-- instant-read cache the UI already relies on; this table is what makes it
-- visible to anything running outside the buyer's own browser.
create table if not exists public.wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.wishlist_items enable row level security;

drop policy if exists "wishlist_items_select_own" on public.wishlist_items;
create policy "wishlist_items_select_own" on public.wishlist_items
  for select using (auth.uid() = user_id);

drop policy if exists "wishlist_items_insert_own" on public.wishlist_items;
create policy "wishlist_items_insert_own" on public.wishlist_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "wishlist_items_delete_own" on public.wishlist_items;
create policy "wishlist_items_delete_own" on public.wishlist_items
  for delete using (auth.uid() = user_id);
