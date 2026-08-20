-- Runs the weekly-deals revenue-maximizing algorithm every Monday at
-- 00:00 UTC, same net.http_post-with-x-cron-secret pattern already used
-- by roblox-cookie-healthcheck / discord-member-snapshot /
-- cron-lifecycle-emails. The secret matches what's set via
-- `supabase secrets set CRON_SECRET=...` on admin-weekly-deals - only
-- authorizes the 'run' action, never revert/exclude/include (see that
-- function's own auth check).
select cron.schedule(
  'weekly-deals-refresh',
  '0 0 * * 1',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/admin-weekly-deals',
    headers := jsonb_build_object('x-cron-secret', '13af5389fbcdccf405577c9914db3d6d9ba1fd9bf9b890a2', 'Content-Type', 'application/json'),
    body := '{"action":"run"}'::jsonb
  );
  $$
);
