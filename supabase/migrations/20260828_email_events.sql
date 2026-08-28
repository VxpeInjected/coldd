create table if not exists public.email_events (
  id            bigint generated always as identity primary key,
  resend_email_id text,
  type          text not null,
  recipient     text,
  campaign_id   uuid references public.email_campaigns(id) on delete set null,
  subject       text,
  link_url      text,
  occurred_at   timestamptz not null default now(),
  received_at   timestamptz not null default now(),
  raw           jsonb
);
create index if not exists email_events_campaign_idx on public.email_events (campaign_id, type);
create index if not exists email_events_recipient_idx on public.email_events (lower(recipient), occurred_at);
create unique index if not exists email_events_dedupe_idx on public.email_events (resend_email_id, type, occurred_at);

alter table public.email_events enable row level security;
drop policy if exists email_events_select_admin on public.email_events;
create policy email_events_select_admin on public.email_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

comment on table public.email_events is 'Resend delivery webhook events (sent/delivered/opened/clicked/bounced/complained). Written by the resend-webhook edge function via service role; admin-readable for campaign analytics.';
