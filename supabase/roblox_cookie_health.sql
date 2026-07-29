-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.
--
-- Singleton status row for the Phase D group-transaction fallback's
-- .ROBLOSECURITY cookie, updated by the scheduled roblox-cookie-
-- healthcheck function (see roblox_cookie_cron.sql) and read by the
-- admin panel to show a warning banner if it's gone stale.

create table if not exists public.roblox_cookie_health (
  id boolean primary key default true,
  ok boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  constraint roblox_cookie_health_singleton check (id)
);

insert into public.roblox_cookie_health (id) values (true) on conflict (id) do nothing;

alter table public.roblox_cookie_health enable row level security;

drop policy if exists "roblox_cookie_health_select_admin" on public.roblox_cookie_health;
create policy "roblox_cookie_health_select_admin" on public.roblox_cookie_health
  for select using (public.is_admin());

-- No client write policy - only the service-role healthcheck function
-- (or admin-manage-order-style Edge Functions, if ever needed) writes here.
