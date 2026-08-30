-- Structured reseller onboarding: contact channel (email OR discord) + repeatable
-- selling-location rows (platform + storefront URL). Backs the redesigned
-- required post-purchase reseller popup (submit-reseller-info / admin-resellers).

alter table public.resellers
  add column if not exists contact_type      text,
  add column if not exists contact_value     text,
  add column if not exists selling_locations jsonb not null default '[]'::jsonb;
