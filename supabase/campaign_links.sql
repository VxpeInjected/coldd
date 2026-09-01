-- Run this once in Supabase Dashboard -> SQL Editor (or `supabase db query --linked
-- --file supabase/campaign_links.sql`). Safe to re-run (idempotent).
--
-- Admin-managed trackable links (not the user-to-user referral system -
-- these are for external marketing: "embed ?cmp=partner in a link for our
-- partner program", "?cmp=yt-sponsor for a YouTube sponsorship"). Clicks
-- are counted the moment ?cmp=CODE is seen on any page (track-campaign-click,
-- public/unauthenticated, mirrors track-referral-click). Conversion is
-- tracked on the order itself via campaign_code, set at checkout creation
-- time from whatever code was captured client-side - unlike referrals,
-- this works for guest checkouts too, since it's not tied to a signed-in
-- profile.

create table if not exists public.campaign_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  -- Site-relative path the link points to (e.g. "/", "/shop",
  -- "/product?id=all-brawl-full-game") - ?cmp=CODE gets appended to this
  -- when the admin panel builds the copyable link. Purely a convenience
  -- for generating the URL; the click capture itself (supabase-init.js)
  -- watches for ?cmp= on any page, not just this one.
  destination text not null default '/',
  clicks integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
alter table public.campaign_links add column if not exists destination text not null default '/';

alter table public.campaign_links enable row level security;

do $$ begin
  create policy "campaign_links_select_admin" on public.campaign_links
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy - only admin-campaign-links (create/update/delete)
-- and track-campaign-click (increments clicks) write here, both service role.

alter table public.orders add column if not exists campaign_code text;
create index if not exists orders_campaign_code_idx on public.orders(campaign_code) where campaign_code is not null;
