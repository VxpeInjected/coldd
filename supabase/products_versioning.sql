-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Product versioning, which the automatic release log is derived from.
--
-- Neither column existed, so nothing is being migrated - every product starts
-- unversioned and only appears in the release log once it is given a version.
-- That is deliberate: back-filling "v1.0.0" across 39 products would invent a
-- release history that never happened.

alter table public.products add column if not exists version text;
alter table public.products add column if not exists changelog text;

-- The version last announced in the release log. admin-upsert-product compares
-- against this rather than against the previous row value, so re-saving a
-- product without touching its version cannot emit a duplicate entry, and an
-- admin fixing a typo in the changelog does not fire a second announcement.
alter table public.products add column if not exists last_released_version text;

comment on column public.products.version is
  'Free-form version string shown on the product page and in the release log, e.g. 1.2.0. Null means unversioned - the product never appears in the release log.';
comment on column public.products.changelog is
  'What changed in THIS version. Cleared by the admin when bumping to a new version. If empty, the release log entry records the version bump with no detail rather than an empty section.';
comment on column public.products.last_released_version is
  'Internal. The version already announced; prevents duplicate release entries.';
