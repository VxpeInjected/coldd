-- Run once in Supabase Dashboard -> SQL Editor. Idempotent.
--
-- orders.purchased_by_user_id (added in 20260820_gifting.sql) was created
-- with no ON DELETE action, so Postgres defaulted it to NO ACTION - the
-- opposite of orders.user_id's own "on delete set null" a few lines
-- above it in the same table. Confirmed live via pg_constraint
-- (confdeltype = 'a').
--
-- Consequence: any account that has ever bought a gift for someone else
-- cannot delete their own account. delete-account calls
-- admin.auth.admin.deleteUser(), which is a real DELETE against
-- auth.users under the hood - Postgres enforces the FK exactly as
-- written, so it throws a foreign-key-violation and the whole deletion
-- fails, for as long as that gift order (or any gift order they ever
-- placed) exists. Right-to-erasure functionally broken for every past
-- gift-giver, not a display/wording issue.
alter table public.orders drop constraint if exists orders_purchased_by_user_id_fkey;
alter table public.orders
  add constraint orders_purchased_by_user_id_fkey
  foreign key (purchased_by_user_id) references auth.users(id) on delete set null;
