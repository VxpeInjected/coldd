-- Run once in Supabase Dashboard -> SQL Editor. Idempotent.
--
-- "Developer Mode" for site_status: while dev_mode is true, the site
-- auto-flips maintenance -> open whenever an admin is working (the admin
-- panel POSTs admin-dev-mode {action:'heartbeat'} on load, every 5 min,
-- and on every logged action), and the cron below returns it to
-- maintenance after ~55 min with no heartbeat.
--
-- Manually setting "maintenance" from the Site Access panel switches
-- dev_mode off (admin-set-site-status) - an explicit choice wins.
--
-- Automated site work also counts as activity via the dev-heartbeat edge
-- function: set DEV_HEARTBEAT_SECRET and point a GitHub push webhook at
--   https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/dev-heartbeat
-- (content type application/json, "push" event, secret = DEV_HEARTBEAT_SECRET).
-- Every push to main then refreshes the clock / re-opens the site.

alter table public.site_status
  add column if not exists dev_mode boolean not null default false,
  add column if not exists dev_mode_active_at timestamptz;

comment on column public.site_status.dev_mode is 'When true, the site auto-flips maintenance->open on admin activity (admin-dev-mode heartbeat) and a cron flips it back to maintenance after ~1h of no activity.';
comment on column public.site_status.dev_mode_active_at is 'Last admin heartbeat while dev_mode is on. The auto-maintenance cron diffs against this.';

create extension if not exists pg_cron with schema extensions;

select cron.unschedule('dev-mode-auto-maintenance')
where exists (select 1 from cron.job where jobname = 'dev-mode-auto-maintenance');

select cron.schedule(
  'dev-mode-auto-maintenance',
  '*/10 * * * *',
  $$
  update public.site_status
  set mode = 'maintenance', updated_at = now()
  where id
    and dev_mode = true
    and mode = 'open'
    and dev_mode_active_at is not null
    and dev_mode_active_at < now() - interval '55 minutes';
  $$
);

-- Initial state: open, Developer Mode on, fresh heartbeat.
update public.site_status
set mode = 'open', dev_mode = true, dev_mode_active_at = now(),
    maintenance_message = null, maintenance_ends_at = null, updated_at = now()
where id;
