-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires reviews.sql to already exist.
--
-- Lets admins manually import a review sourced from another platform
-- (BuiltByBit, Discord, etc.) - not tied to a real coldd account, so
-- user_id has to become nullable. Multiple NULL user_id rows for the
-- same product are fine under the existing unique(product_id, user_id)
-- constraint (NULLs are never considered equal in Postgres uniqueness).

alter table public.reviews alter column user_id drop not null;
alter table public.reviews add column if not exists source text not null default 'coldd';
