-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Site-wide error capture: uncaught JS errors, unhandled promise
-- rejections, and failed Edge Function calls, from any visitor
-- (signed in or not) - see supabase-init.js's window.onerror /
-- unhandledrejection listeners and invokeFn()'s failure path. Each row
-- gets a short human-referenceable code (e.g. ERR-4K9X2P) generated
-- client-side, shown in the admin panel's audit log alongside staff
-- actions so an error a customer hit can be found and diagnosed from
-- what little they can report ("it said ERR-4K9X2P").
--
-- Insert is open to anyone, including anon - the whole point is to
-- accept a report from a client that may not even be signed in, and a
-- write-only insert can't leak anything back to the inserter. Select is
-- admin-only, same as admin_audit_log.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  code text not null,
  kind text not null,
  message text not null,
  stack text,
  fn_name text,
  page_url text,
  user_agent text,
  user_id uuid,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_code_idx on public.client_errors (code);

alter table public.client_errors enable row level security;

drop policy if exists "client_errors_insert_anyone" on public.client_errors;
create policy "client_errors_insert_anyone" on public.client_errors
  for insert with check (true);

drop policy if exists "client_errors_select_admin" on public.client_errors;
create policy "client_errors_select_admin" on public.client_errors
  for select using (public.is_admin());
