-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- Second reset: the ledger rows inserted so far were keyed by Roblox's
-- transaction "id" field, which is always 0 on this endpoint (a redacted
-- placeholder) - every transaction collided on the same primary key, so
-- at most ~1 row ever actually got stored no matter how many pages were
-- scanned. The sync now keys rows by idHash (the real unique value)
-- instead. Clear out the bad data so the next sync rebuilds cleanly.

truncate table public.roblox_group_transactions;

update public.roblox_group_revenue
set total_robux = 0, parcel_robux = 0, last_transaction_id = null, resume_cursor = null
where id = true;
