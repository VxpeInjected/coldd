-- Tracks Roblox accounts known to already own a specific pooled pass -
-- populated whenever verify-robux-order detects a buyer owns a pass with
-- no matching sale transaction (pre-owned, not from this purchase), which
-- is exactly the failure mode a small reused pool guarantees will happen
-- to repeat buyers eventually. leasePassForOrder already excludes
-- passes a buyer has a PAID order against, but that only covers
-- purchases made *through this system* - this covers purchases detected
-- any other way (this table), so both signals compound instead of only
-- one of them mattering.
create table if not exists public.roblox_owned_passes (
  roblox_id text not null,
  gamepass_id text not null,
  detected_at timestamptz not null default now(),
  primary key (roblox_id, gamepass_id)
);
