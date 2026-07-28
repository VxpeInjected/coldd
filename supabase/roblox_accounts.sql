-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Links a signed-in Supabase user to their Roblox account (via a custom
-- OAuth2 handshake - Roblox isn't a Supabase-native auth provider, unlike
-- Discord). Tokens are only ever read/written by the service role inside
-- roblox-oauth-callback / verify-robux-order - deliberately no select or
-- write policy for regular clients, so a compromised frontend can never
-- read another user's (or even its own) Roblox tokens. The frontend
-- checks link status via the roblox-link-status Edge Function instead.

create table if not exists public.roblox_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  roblox_id text not null unique,
  roblox_username text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  linked_at timestamptz not null default now()
);

alter table public.roblox_accounts enable row level security;
