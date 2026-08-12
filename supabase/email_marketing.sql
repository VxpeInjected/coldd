-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- EMAIL MARKETING
--
-- Audience model: every existing coldd account is treated as subscribed by
-- default (opt-out, not opt-in - an explicit choice, not an oversight).
-- profiles.email_unsub_token is a stable per-account token so an
-- unsubscribe link never needs a signed-in session to work - clicking it in
-- an email client must always work, logged in or not.

alter table public.profiles
  add column if not exists marketing_unsubscribed boolean not null default false;

alter table public.profiles
  add column if not exists email_unsub_token uuid not null default gen_random_uuid();

-- Marks an abandoned cart as already emailed once, so the recovery cron
-- never sends a second "you left something" email for the same cart.
alter table public.cart_snapshots
  add column if not exists abandoned_email_sent_at timestamptz;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_html text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_campaigns enable row level security;

do $$ begin
  create policy "email_campaigns_select_admin" on public.email_campaigns
    for select using (public.is_admin());
exception when duplicate_object then null;
end $$;

-- No client write policy - campaigns are only ever created/sent by
-- admin-send-campaign (service role).

create index if not exists email_campaigns_created_at_idx on public.email_campaigns(created_at desc);
create index if not exists profiles_email_unsub_token_idx on public.profiles(email_unsub_token);
