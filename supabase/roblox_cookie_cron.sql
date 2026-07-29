-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- IMPORTANT: replace REPLACE_WITH_ROBLOX_CRON_SECRET below with the same
-- value you set via:
--   supabase secrets set ROBLOX_CRON_SECRET=<some random string>
-- Never commit the real secret value into this file - it's checked into
-- git. Generate one with e.g. `openssl rand -hex 32`.
--
-- Schedules roblox-cookie-healthcheck every 6 hours to validate the
-- Phase D fallback's .ROBLOSECURITY cookie and alert (via
-- ROBLOX_ALERT_WEBHOOK_URL, if set) the moment it goes from healthy to
-- broken - so a dead cookie gets noticed within hours, not whenever a
-- Robux order happens to need the fallback and silently fails.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'roblox-cookie-healthcheck',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/roblox-cookie-healthcheck',
    headers := jsonb_build_object('x-cron-secret', 'REPLACE_WITH_ROBLOX_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove/replace the schedule later:
--   select cron.unschedule('roblox-cookie-healthcheck');
