-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- ORDER-QUEUE GAMEPASS POOL
--
-- Replaces the per-product gamepass model. Instead of every product owning a
-- permanent gamepass, a small pool of reusable passes is kept (~5 to start).
-- When a buyer checks out with Robux we LEASE one pass, set its Roblox price to
-- that order's exact Robux total, and hand them that single pass to buy.
--
-- Why a lease and not a simple "is_free" flag:
--
-- Roblox has no transactions and no compare-and-set on gamepass price. The
-- window between "we picked a pass" and "the buyer actually pays" is wide open,
-- and two buyers hitting the site seconds apart is the normal case, not the
-- edge case. If two orders ever share one pass, the cheaper buyer can pay the
-- cheaper price and be credited the more expensive order. That is a direct
-- money-loss bug, so exclusivity has to be guaranteed in Postgres, which does
-- have transactions.

create table if not exists public.roblox_pool_passes (
  id uuid primary key default gen_random_uuid(),
  gamepass_id text not null unique,
  universe_id text not null,
  label text,

  -- Lease state. All four move together or not at all.
  leased_order_id uuid references public.orders(id) on delete set null,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  -- The Robux price we set on Roblox for THIS lease. Verification compares the
  -- real transaction amount against this, never against the order total alone -
  -- if a pass were ever mis-leased, matching on the order total would happily
  -- confirm a payment that never covered it.
  lease_price_robux integer,

  active boolean not null default true,
  -- Set false by hand if a pass is wedged (Roblox price update failing, pass
  -- deleted upstream). Keeps it out of the pool without deleting history.
  created_at timestamptz not null default now()
);

-- The lease picker filters on exactly this predicate, so index it.
create index if not exists roblox_pool_passes_available_idx
  on public.roblox_pool_passes (active, lease_expires_at);
create index if not exists roblox_pool_passes_order_idx
  on public.roblox_pool_passes (leased_order_id);

alter table public.roblox_pool_passes enable row level security;

do $$ begin
  create policy "roblox_pool_passes_select_admin" on public.roblox_pool_passes
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy. Leasing happens only through the RPCs below, called
-- with the service role from create-robux-order / verify-robux-order.


-- ---------------------------------------------------------------------------
-- lease_roblox_pass(order_id, ttl_seconds)
--
-- Returns the leased row, or no rows when the pool is exhausted (which is the
-- caller's signal to provision another pass on Roblox and retry).
--
-- Two properties this function must have, and how each is obtained:
--
--   EXCLUSIVITY - `for update skip locked` is the standard Postgres queue
--   primitive. Concurrent callers each lock a different candidate row and skip
--   any row another transaction already holds, so two buyers can never be
--   handed the same pass. A plain `select ... limit 1` followed by an update
--   would let both read the same row before either wrote.
--
--   IDEMPOTENCY - a buyer who double-submits, refreshes, or retries must get
--   back the SAME pass, not consume a second one. The first branch returns any
--   lease this order already holds, so repeat calls are free.
-- ---------------------------------------------------------------------------
create or replace function public.lease_roblox_pass(
  p_order_id uuid,
  p_ttl_seconds integer default 900
)
returns public.roblox_pool_passes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.roblox_pool_passes;
begin
  -- Already leased to this order? Extend and return it. This is the duplicate
  -- order guard: it makes the whole call idempotent per order.
  update public.roblox_pool_passes
  set lease_expires_at = now() + make_interval(secs => p_ttl_seconds)
  where leased_order_id = p_order_id
  returning * into v_row;

  if found then
    return v_row;
  end if;

  -- Otherwise take the longest-idle available pass. "Available" means active
  -- and either never leased or past its expiry. Reclaiming an expired lease is
  -- what stops an abandoned checkout from retiring a pass forever.
  --
  -- The `not exists` guard is the important one: never reclaim a pass whose
  -- order actually got paid but has not been released yet. Re-pricing a pass
  -- out from under a completed purchase is exactly the money bug this table
  -- exists to prevent.
  update public.roblox_pool_passes p
  set leased_order_id = p_order_id,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => p_ttl_seconds),
      lease_price_robux = null
  where p.id = (
    select c.id
    from public.roblox_pool_passes c
    where c.active
      and (c.leased_order_id is null or c.lease_expires_at < now())
      and not exists (
        select 1 from public.orders o
        where o.id = c.leased_order_id
          and o.status = 'paid'
      )
    order by c.lease_expires_at asc nulls first
    limit 1
    for update skip locked
  )
  returning * into v_row;

  return v_row;  -- null row when the pool is exhausted
end;
$$;


-- Records the price we actually set on Roblox for this lease. Separate from
-- leasing because the Roblox API call sits between the two: we lease, then
-- PATCH the price, then commit the number only once Roblox confirmed it.
create or replace function public.set_roblox_pass_price(
  p_order_id uuid,
  p_price_robux integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.roblox_pool_passes
  set lease_price_robux = p_price_robux
  where leased_order_id = p_order_id;
$$;


-- Called after a successful verification, or when an order is cancelled.
-- Returns the pass to the pool immediately rather than waiting out the TTL,
-- which matters when the pool is small.
create or replace function public.release_roblox_pass(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.roblox_pool_passes
  set leased_order_id = null,
      leased_at = null,
      lease_expires_at = null,
      lease_price_robux = null
  where leased_order_id = p_order_id;
$$;


-- Admin/monitoring view of pool pressure. If free_now is regularly 0 the pool
-- is undersized and checkouts are being made to wait on provisioning.
create or replace function public.roblox_pool_stats()
returns table (total bigint, active_total bigint, free_now bigint, leased_now bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where active),
    count(*) filter (
      where active and (leased_order_id is null or lease_expires_at < now())
    ),
    count(*) filter (
      where active and leased_order_id is not null and lease_expires_at >= now()
    )
  from public.roblox_pool_passes;
$$;
