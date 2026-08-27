-- profiles.notification_prefs — jsonb bag of per-account notification toggles
-- (orderReceipts, productUpdates, promotions, saleDms, roleSync, supportReplies)
-- written by the dashboard "Notification preferences" panel and read by
-- cron-lifecycle-emails (promotions gates discount-bearing emails),
-- marketing-signup, and the site-wide discount popup.
--
-- This was originally defined in supabase/notification_prefs.sql but that file
-- was never applied to production: every read logged
-- "column profiles.notification_prefs does not exist" and every Save in the
-- prefs panel failed. Re-homed here as a dated migration. Safe to re-run.

alter table public.profiles add column if not exists notification_prefs jsonb;
