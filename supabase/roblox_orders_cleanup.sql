-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- Earlier sync runs (before the idHash fix) could only ever insert one
-- synthetic parcel order, keyed by the collided transaction id "0". This
-- removes that specific garbage row (and its order_items) if present.
-- Does not touch any other orders.

delete from public.order_items
where order_id in (select id from public.orders where external_transaction_id = '0');

delete from public.orders
where external_transaction_id = '0';
