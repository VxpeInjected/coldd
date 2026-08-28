create table if not exists public.client_events (
  id          bigint generated always as identity primary key,
  type        text not null,
  session_id  text,
  visitor_id  text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists client_events_type_time_idx on public.client_events (type, created_at);
create index if not exists client_events_session_idx on public.client_events (session_id);

alter table public.client_events enable row level security;
drop policy if exists client_events_select_admin on public.client_events;
create policy client_events_select_admin on public.client_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

comment on table public.client_events is 'Lightweight funnel/interaction events from the site (add_to_cart, checkout_started, search). Written by track-event edge function via service role; no PII, gated by the same analytics consent as page_views.';
