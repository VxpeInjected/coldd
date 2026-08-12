-- Run this once in Supabase Dashboard -> SQL Editor.
--
-- IMPORTANT: replace REPLACE_WITH_ABANDONED_CART_CRON_SECRET below with the
-- same value set via:
--   supabase secrets set ABANDONED_CART_CRON_SECRET=<some random string>
-- Never commit the real secret value into this file - it's checked into git.
-- Generate one with e.g. `openssl rand -hex 32`.
--
-- Schedules cron-abandoned-cart-emails every 30 minutes. The function
-- itself only touches carts older than 2 hours, so this cadence just
-- controls how promptly a newly-eligible cart gets picked up, not how old
-- a cart has to be.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cron-abandoned-cart-emails',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/cron-abandoned-cart-emails',
    headers := jsonb_build_object('x-cron-secret', 'REPLACE_WITH_ABANDONED_CART_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove/replace the schedule later:
--   select cron.unschedule('cron-abandoned-cart-emails');
