-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- The admin audit log (admin.js logAudit()) was localStorage-only -
-- per-admin-browser, never shared between staff, lost on cache clear.
-- This gives it a real table so every admin sees the same log. Writes
-- go straight from the client (no dedicated Edge Function - logAudit()
-- is called ~30 places across admin.js right after an action already
-- succeeded via its own admin-* Edge Function or RLS-permitted write),
-- so the insert policy re-checks is_admin() itself and pins actor_id to
-- the caller's own uid so nobody can log an action as someone else.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  actor_name text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_log_select_admin" on public.admin_audit_log;
create policy "admin_audit_log_select_admin" on public.admin_audit_log
  for select using (public.is_admin());

drop policy if exists "admin_audit_log_insert_admin" on public.admin_audit_log;
create policy "admin_audit_log_insert_admin" on public.admin_audit_log
  for insert with check (public.is_admin() and actor_id = auth.uid());
