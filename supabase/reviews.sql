-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  -- Denormalized snapshot of the reviewer's display name at submit time -
  -- avoids needing a public profiles-read RLS policy just so the storefront
  -- can show who wrote each approved review.
  user_name text,
  reply text,
  reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

alter table public.reviews enable row level security;

drop policy if exists "reviews_select_approved" on public.reviews;
create policy "reviews_select_approved" on public.reviews
  for select using (status = 'approved');

drop policy if exists "reviews_select_own" on public.reviews;
create policy "reviews_select_own" on public.reviews
  for select using (auth.uid() = user_id);

drop policy if exists "reviews_select_admin" on public.reviews;
create policy "reviews_select_admin" on public.reviews
  for select using (public.is_admin());

-- No client write policy - inserts go through submit-review (verifies
-- the caller actually owns the product first), moderation (approve/
-- hide/reply) through admin-moderate-review. Both use the service role.

create index if not exists reviews_product_id_idx on public.reviews(product_id);

-- Keeps products.rating/reviews_count genuinely accurate (previously
-- just manually-editable display fields with no real basis) - recomputed
-- from approved reviews any time a review is inserted/updated/deleted.
create or replace function public.recompute_product_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product uuid;
begin
  target_product := coalesce(new.product_id, old.product_id);
  update public.products p
  set reviews_count = sub.cnt, rating = coalesce(sub.avg_stars, 0)
  from (
    select count(*) as cnt, avg(stars)::numeric(3,2) as avg_stars
    from public.reviews
    where product_id = target_product and status = 'approved'
  ) sub
  where p.id = target_product;
  return null;
end;
$$;

drop trigger if exists reviews_recompute_rating on public.reviews;
create trigger reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_product_rating();
