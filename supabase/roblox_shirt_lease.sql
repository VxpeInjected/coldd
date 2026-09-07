-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- SINGLE-SHIRT FALLBACK LEASE
--
-- Gamepasses can't be bought by accounts under 13 (and are awkward for some
-- under-16 accounts), so the Robux checkout offers a fallback: buy a classic
-- group SHIRT priced to the order total instead. Roblox only allows ONE classic
-- shirt per group and none can be created any more, so there is exactly one
-- shirt to share between every buyer who needs the fallback.
--
-- That makes this the gamepass pool (roblox_pool_passes) with a pool size of
-- one: a buyer LEASES the shirt, we set its Roblox price to their exact order
-- total, they buy it, verify-robux-order confirms it from the group sale
-- ledger. While the shirt is leased to one order no other order can touch it -
-- the checkout button just shows "Loading" until it frees. Same reasoning as
-- the pool: Roblox has no transactions and no compare-and-set on price, so
-- exclusivity has to be won in Postgres before the price is changed on Roblox.

create table if not exists public.roblox_shirt_lease (
  -- One row, ever. The fixed id keeps upserts/re-runs from making a second.
  id integer primary key default 1,
  asset_id text not null,

  -- Lease state - all four move together or not at all, exactly as
  -- roblox_pool_passes does.
  leased_order_id uuid references public.orders(id) on delete set null,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_price_robux integer,

  updated_at timestamptz not null default now(),
  constraint roblox_shirt_lease_singleton check (id = 1)
);

-- Seed the single row. Replace the asset id here if the group's shirt ever
-- changes (you can't make a new one, but the group could be swapped).
insert into public.roblox_shirt_lease (id, asset_id)
values (1, '139180297115581')
on conflict (id) do update set asset_id = excluded.asset_id;

alter table public.roblox_shirt_lease enable row level security;

do $$ begin
  create policy "roblox_shirt_lease_select_admin" on public.roblox_shirt_lease
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy. Leasing happens only through the RPCs below, called
-- with the service role from switch-robux-order-to-shirt / verify-robux-order.


-- Which fulfilment path an order took. 'gamepass' (default) = the pool pass;
-- 'shirt' = the fallback below. verify-robux-order branches on this.
alter table public.orders add column if not exists roblox_pay_method text not null default 'gamepass';


-- ---------------------------------------------------------------------------
-- lease_roblox_shirt(order_id, ttl_seconds)
--
-- Returns the row when this order now holds the shirt, or NO ROWS when the
-- shirt is currently leased to a different, still-live order (the caller's
-- signal to tell the buyer "loading, try again shortly").
--
--   EXCLUSIVITY - `for update skip locked` on the single row: a second caller
--   trying to lease while the row is locked by another transaction gets no
--   row back rather than blocking or stealing it.
--
--   IDEMPOTENCY - a buyer who double-clicks or retries gets the SAME lease
--   back, refreshed, not a rejection.
--
--   The `not exists (paid order)` guard is the money-safety one: never reclaim
--   the shirt from an order that actually got paid but hasn't been released
--   yet - re-pricing it out from under a completed purchase is the exact bug
--   the lease exists to stop.
-- ---------------------------------------------------------------------------
create or replace function public.lease_roblox_shirt(
  p_order_id uuid,
  p_ttl_seconds integer default 900
)
returns public.roblox_shirt_lease
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.roblox_shirt_lease;
begin
  -- Already ours? Extend and return it.
  update public.roblox_shirt_lease
  set lease_expires_at = now() + make_interval(secs => p_ttl_seconds),
      updated_at = now()
  where id = 1 and leased_order_id = p_order_id
  returning * into v_row;

  if found then
    return v_row;
  end if;

  -- Otherwise take it, but only if it's free (never leased, or the lease
  -- lapsed) AND the order that last held it isn't a paid-but-unreleased one.
  update public.roblox_shirt_lease p
  set leased_order_id = p_order_id,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => p_ttl_seconds),
      lease_price_robux = null,
      updated_at = now()
  where p.id = (
    select c.id
    from public.roblox_shirt_lease c
    where c.id = 1
      and (c.leased_order_id is null or c.lease_expires_at < now())
      and not exists (
        select 1 from public.orders o
        where o.id = c.leased_order_id
          and o.status = 'paid'
      )
    for update skip locked
  )
  returning * into v_row;

  return v_row;  -- null row when the shirt is busy
end;
$$;


-- Records the price we actually set on Roblox for this lease.
create or replace function public.set_roblox_shirt_price(
  p_order_id uuid,
  p_price_robux integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.roblox_shirt_lease
  set lease_price_robux = p_price_robux, updated_at = now()
  where id = 1 and leased_order_id = p_order_id;
$$;


-- Hands the shirt back - after a verified purchase, or a cancelled/abandoned
-- switch. Next lease re-prices it, so a stale price left on it is harmless.
create or replace function public.release_roblox_shirt(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.roblox_shirt_lease
  set leased_order_id = null,
      leased_at = null,
      lease_expires_at = null,
      lease_price_robux = null,
      updated_at = now()
  where id = 1 and leased_order_id = p_order_id;
$$;
