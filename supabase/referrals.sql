-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists referral_clicks integer not null default 0;

-- Payout requests only - no automated money movement. A user requests a
-- payout in a method of their choosing (USD, Robux, or store credit); an
-- admin manually reviews and marks it paid/denied from the admin panel.
create table if not exists public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('usd', 'robux', 'store_credit')),
  amount_usd numeric(10,2),
  amount_robux integer,
  status text not null default 'requested' check (status in ('requested', 'paid', 'denied')),
  note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.referral_payouts enable row level security;

drop policy if exists "referral_payouts_select_own" on public.referral_payouts;
create policy "referral_payouts_select_own" on public.referral_payouts
  for select using (auth.uid() = user_id);

drop policy if exists "referral_payouts_select_admin" on public.referral_payouts;
create policy "referral_payouts_select_admin" on public.referral_payouts
  for select using (public.is_admin());

-- No client write policy - requests go through request-referral-payout
-- (validates the amount against the caller's actual available balance),
-- resolution goes through admin-manage-referral-payout. Both service role.

create index if not exists referral_payouts_user_id_idx on public.referral_payouts(user_id);
create index if not exists profiles_referred_by_idx on public.profiles(referred_by);
