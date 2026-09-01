-- Curated (permanent, public) product bundles.
--
-- Reuses bundle_deals rather than a new table: a curated bundle is just a
-- bundle_deals row with source='curated', no user_id/email, no expiry,
-- plus display metadata. priceItems() already applies bundle_pct to a
-- cart carrying the row's token when every slug is present, so checkout
-- needs no change.
--
-- Run once, then deploy admin-upsert-bundle + admin-delete-bundle.

alter table public.bundle_deals
  add column if not exists title  text,
  add column if not exists image  text,
  add column if not exists slug   text,
  add column if not exists active boolean not null default true;

-- One curated bundle per slug.
create unique index if not exists bundle_deals_curated_slug_key
  on public.bundle_deals (slug) where source = 'curated';

-- Public read for live curated bundles only. Auto-minted per-user deals
-- (source in 'post_purchase' / 'wishlist_reminder') stay admin-only via the
-- existing bundle_deals_select_admin policy - they can carry an email.
do $$ begin
  create policy "bundle_deals_select_curated_public" on public.bundle_deals
    for select using (source = 'curated' and active = true);
exception when duplicate_object then null;
end $$;
