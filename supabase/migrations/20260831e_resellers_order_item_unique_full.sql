-- The old partial unique index on resellers.order_item_id
-- (WHERE order_item_id IS NOT NULL) could not back an
-- `ON CONFLICT (order_item_id)` upsert - Postgres rejects a partial index
-- there unless the statement repeats the predicate, which PostgREST's
-- upsert does not. Result: every submit-reseller-info / reseller-profile /
-- admin-resellers upsert failed ("no unique or exclusion constraint
-- matching the ON CONFLICT specification"), which is why the resellers
-- table stayed empty and the popup showed "Could not save".
--
-- A full unique constraint works and still allows many manual rows with a
-- NULL order_item_id (NULLs are distinct in a unique index).

drop index if exists public.resellers_order_item_id_key;

alter table public.resellers
  add constraint resellers_order_item_id_key unique (order_item_id);
