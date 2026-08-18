-- Lets create-robux-order skip re-leasing a pooled pass the buyer already
-- owns from a past real purchase. Gamepass ownership on Roblox is
-- permanent - releasing a lease only resets our own DB state, it can never
-- undo the Roblox purchase - so a small pool cycling through repeat buyers
-- will eventually hand someone a pass they already bought. When that
-- happens, "buying" it again is a no-op on Roblox's end (no charge, no new
-- sale), so verify-robux-order can wait forever and never find anything to
-- confirm - not a verification bug, a leasing bug.
--
-- Adds an optional exclude-list parameter with a default, so every existing
-- caller (both without the new arg) keeps working unchanged.
create or replace function public.lease_roblox_pass(
  p_order_id uuid,
  p_ttl_seconds integer,
  p_exclude_gamepass_ids text[] default null
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

  -- Otherwise take the longest-idle available pass, never one on the
  -- exclude list (passes this buyer already owns). "Available" means active
  -- and either never leased or past its expiry.
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
      and (p_exclude_gamepass_ids is null or c.gamepass_id <> all(p_exclude_gamepass_ids))
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

  return v_row;  -- null row when the pool is exhausted (or all remaining are excluded)
end;
$$;
