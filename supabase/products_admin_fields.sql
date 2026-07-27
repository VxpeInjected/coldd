-- Run this once in Supabase Dashboard -> SQL Editor (after products.sql)
--
-- Adds the fields introduced by the expanded admin product-edit form:
-- media (gallery/video), extra pricing, and technical specs. All of these
-- are safe to expose through the existing "products_select_active" public
-- read policy - they're meant to be shown on the storefront.
--
-- Licensing/legal data (proof files, licenser contacts, cost paid, internal
-- restriction notes) is NOT stored here - see product_legal.sql, which is
-- a separate table with no public read policy at all.

alter table public.products add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists video text;
alter table public.products add column if not exists long_description text;
alter table public.products add column if not exists resell_price_usd numeric(10,2);
alter table public.products add column if not exists robux_price numeric(10,2);
alter table public.products add column if not exists tech jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists versions jsonb not null default '[]'::jsonb;

-- tech jsonb shape (mirrors admin.js's defaultTech()):
--   { format, size, fileName, parts, meshParts, unions, scripts }
--
-- versions jsonb shape (mirrors the Push Update panel):
--   [{ version, changelog, date, ... }]
