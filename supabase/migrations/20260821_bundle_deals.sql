-- Backs two features that share the same shape: "here are N products
-- related to what you just bought (or wishlisted) - each at a discount,
-- with a bigger discount if you get all of them" - the post-purchase
-- "Build more for less" upsell and the wishlist stale-item reminder.
--
-- A coupon can't express this (it discounts by platform/category/
-- sitewide, never a specific hand-picked list of products, and can't
-- express "more off if ALL of these are in the same order"), so this is
-- its own small table: one row per minted offer, looked up by
-- priceItems() the moment someone actually checks out with it. No RLS
-- policies at all (service-role only, same as coupons/product_legal) -
-- a shopper is never meant to read this table directly, only redeem the
-- token through checkout.
create table if not exists public.bundle_deals (
  token text primary key,
  slugs text[] not null,
  item_pct numeric not null,
  bundle_pct numeric not null default 0,
  source text not null default 'post_purchase',
  email text,
  user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bundle_deals enable row level security;

-- Per-wishlist-item reminder tracking, mirroring orders.review_email_sent_at.
alter table public.wishlist_items add column if not exists reminder_sent_at timestamptz;

-- Sixth email_automations key, same seeded-disabled pattern as the other
-- five in lifecycle_automations.sql - nothing sends until an admin turns
-- it on. delay_hours defaults to a week (168h) sitting on the wishlist
-- untouched.
insert into public.email_automations (key, enabled, delay_hours, subject, body_md) values
  ('wishlist_reminder', false, 168, 'Still want these? Here''s a discount',
   'Some things on your wishlist are still just sitting there. Here''s a discount to help you finally grab them.')
on conflict (key) do nothing;
