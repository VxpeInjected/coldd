-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.
--
-- Backs the admin Analytics panel's traffic chart with real pageviews
-- instead of synthetic data. No PII - just a client-generated session id
-- (resets every browser session, not tied to an account) and the path
-- visited.

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  session_id text not null,
  path text,
  created_at timestamptz not null default now()
);

alter table public.page_views enable row level security;

drop policy if exists "page_views_select_admin" on public.page_views;
create policy "page_views_select_admin" on public.page_views
  for select using (public.is_admin());

-- No client read/write policy - inserts go through track-pageview
-- (service role, no auth required so it works for signed-out visitors too).

create index if not exists page_views_created_at_idx on public.page_views(created_at);
