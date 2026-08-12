-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- IMPORTANT: replace REPLACE_WITH_LIFECYCLE_CRON_SECRET below with the same
-- value set via:
--   supabase secrets set LIFECYCLE_CRON_SECRET=<some random string>
-- Never commit the real secret value into this file - it's checked into git.
-- Generate one with e.g. `openssl rand -hex 32`.
--
-- Schedules cron-lifecycle-emails every 30 minutes - it handles all three
-- lifecycle automations (abandoned cart, post-purchase review,
-- re-engagement) in one run, reading current on/off + timing + copy from
-- email_automations each time.
--
-- Supersedes the old cron-abandoned-cart-emails job - unschedule that one
-- (select cron.unschedule('cron-abandoned-cart-emails');) and delete its
-- function before running this, so a cart can't get emailed by both.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cron-lifecycle-emails',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/cron-lifecycle-emails',
    headers := jsonb_build_object('x-cron-secret', 'REPLACE_WITH_LIFECYCLE_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove/replace the schedule later:
--   select cron.unschedule('cron-lifecycle-emails');
