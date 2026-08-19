-- Reviews no longer require admin approval before going public - a review
-- is live the moment it's submitted. Moderation is now just hide/reply,
-- not a publish gate. admin_reviewed_at tracks whether staff have looked
-- at a review yet (set when they hide/reply it, or when they view it in
-- the admin Reviews panel), which is what now drives the admin dashboard's
-- "new reviews" to-do item instead of a pending-approval count.
alter table public.reviews add column if not exists admin_reviewed_at timestamptz;

-- The one review still sitting in 'pending' under the old model becomes
-- visible now that there's no approval gate.
update public.reviews set status = 'approved' where status = 'pending';
