-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- The cross-platform Robux revenue tracking feature (roblox-group-
-- revenue-sync) was pulled from the admin UI. This removes the
-- synthetic "Parcel Order" / "Robux Payment" order rows it created
-- during testing, so the Orders panel goes back to showing only real
-- website orders. Does not touch any other orders, and does not drop
-- roblox_group_revenue / roblox_group_transactions (left in place, just
-- unused, in case this gets revisited later).

delete from public.order_items
where order_id in (select id from public.orders where source in ('parcel', 'robux'));

delete from public.orders
where source in ('parcel', 'robux');
