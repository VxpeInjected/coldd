alter table public.site_status
  add column if not exists dev_mode boolean not null default false,
  add column if not exists dev_mode_active_at timestamptz;

comment on column public.site_status.dev_mode is 'When true, the site auto-flips maintenance->open on admin activity (admin-dev-mode heartbeat) and a cron flips it back to maintenance after ~1h of no activity.';
comment on column public.site_status.dev_mode_active_at is 'Last admin heartbeat while dev_mode is on. The auto-maintenance cron diffs against this.';

-- Set the site open now, with Developer Mode on and a fresh heartbeat so
-- it does not immediately flip back.
update public.site_status
set mode = 'open',
    dev_mode = true,
    dev_mode_active_at = now(),
    maintenance_message = null,
    maintenance_ends_at = null,
    updated_at = now()
where id;

-- Cron: every 10 min, if dev mode is on and the site is open but there
-- has been no admin heartbeat for ~55 min, return it to maintenance.
select cron.unschedule('dev-mode-auto-maintenance') where exists (select 1 from cron.job where jobname = 'dev-mode-auto-maintenance');
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
