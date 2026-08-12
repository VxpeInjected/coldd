-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- IMPORTANT: replace REPLACE_WITH_DISCORD_SNAPSHOT_CRON_SECRET below with
-- the same value set via:
--   supabase secrets set DISCORD_SNAPSHOT_CRON_SECRET=<some random string>
-- Never commit the real secret value into this file - it's checked into git.
-- Generate one with e.g. `openssl rand -hex 32`.
--
-- Schedules discord-member-snapshot once a day so the "Discord joins" stat
-- on the admin home dashboard has a real daily history to diff against,
-- independent of whether an admin happens to load the dashboard that day
-- (admin-discord-stats also writes the same row on page load - this is the
-- part that doesn't depend on that).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'discord-member-snapshot',
  '55 23 * * *',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/discord-member-snapshot',
    headers := jsonb_build_object('x-cron-secret', 'REPLACE_WITH_DISCORD_SNAPSHOT_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove/replace the schedule later:
--   select cron.unschedule('discord-member-snapshot');
