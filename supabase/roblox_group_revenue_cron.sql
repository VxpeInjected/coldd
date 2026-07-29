-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- Reuses the same ROBLOX_CRON_SECRET already set for
-- roblox-cookie-healthcheck (see roblox_cookie_cron.sql) - if you haven't
-- set that up yet, set one with:
--   supabase secrets set ROBLOX_CRON_SECRET=<some random string>
-- Never commit the real secret value - replace it below before running.
--
-- Schedules roblox-group-revenue-sync every 15 minutes so "Overall Robux
-- revenue" and Parcel Hub orders stay current without anyone needing to
-- click the manual "Sync now" button in the admin panel.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'roblox-group-revenue-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/roblox-group-revenue-sync',
    headers := jsonb_build_object('x-cron-secret', 'REPLACE_WITH_ROBLOX_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove/replace the schedule later:
--   select cron.unschedule('roblox-group-revenue-sync');
