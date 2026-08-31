-- Developer Mode removed. It auto-flipped maintenance->open on admin
-- activity and a cron flipped it back; in practice it mostly caused the
-- site to silently reopen. Site access is now just the explicit
-- open/maintenance toggle plus the tester-access allowlist.

select cron.unschedule('dev-mode-auto-maintenance')
where exists (select 1 from cron.job where jobname = 'dev-mode-auto-maintenance');

alter table public.site_status
  drop column if exists dev_mode,
  drop column if exists dev_mode_active_at;
