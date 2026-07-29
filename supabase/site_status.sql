-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Singleton site-wide mode: open / maintenance / locked. Read by EVERY
-- visitor's browser on EVERY page load (site-gate.js), so this needs a
-- public select policy - unlike almost everything else in this project,
-- there is deliberately no auth requirement to read it. Only the
-- admin-set-site-status Edge Function (service role, is_admin gated)
-- writes to it.
--
-- Recovery note: if this ever gets misconfigured in a way that's hard to
-- fix from the site itself, you can always fix it directly here in the
-- SQL Editor - `update public.site_status set mode = 'open' where id;` -
-- bypasses the website entirely.

create table if not exists public.site_status (
  id boolean primary key default true,
  mode text not null default 'open' check (mode in ('open', 'maintenance', 'locked')),
  maintenance_message text,
  maintenance_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint site_status_singleton check (id)
);

insert into public.site_status (id) values (true) on conflict (id) do nothing;

alter table public.site_status enable row level security;

drop policy if exists "site_status_select_public" on public.site_status;
create policy "site_status_select_public" on public.site_status
  for select using (true);
