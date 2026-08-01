-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent - just replaces the function).
--
-- request-referral-payout previously computed "available balance" (earned
-- minus already-requested) with two separate SELECTs in the Edge Function,
-- then did a plain INSERT - a check-then-act race. Two concurrent requests
-- (a double-clicked "Request payout" button, or two tabs) could both read
-- the same available balance before either INSERT lands, letting a user
-- request more in total payouts than they've actually earned.
--
-- This moves the whole read-check-insert into a single Postgres function,
-- serialized per-user with pg_advisory_xact_lock (released automatically
-- at the end of the transaction), so concurrent calls for the same user
-- are forced to run one after another - the second call always sees the
-- first's row once it commits.

create or replace function public.request_referral_payout(
  p_user_id uuid,
  p_method text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  earned_usd numeric := 0;
  earned_robux numeric := 0;
  reserved_usd numeric := 0;
  reserved_robux numeric := 0;
  available numeric;
  referral_rate constant numeric := 0.20;
begin
  if p_method not in ('usd', 'robux', 'store_credit') then
    return jsonb_build_object('ok', false, 'error', 'Invalid payout method.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter an amount.');
  end if;

  -- Serialize concurrent calls for this same user for the rest of this
  -- transaction - hashtext() collapses the uuid into an int4 lock key.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select
    coalesce(sum(case when o.currency = 'robux' then 0 else o.total_usd * referral_rate end), 0),
    coalesce(sum(case when o.currency = 'robux' then o.total_robux * referral_rate else 0 end), 0)
  into earned_usd, earned_robux
  from public.orders o
  join public.profiles p on p.id = o.user_id
  where p.referred_by = p_user_id and o.status = 'paid';

  select
    coalesce(sum(amount_usd), 0),
    coalesce(sum(amount_robux), 0)
  into reserved_usd, reserved_robux
  from public.referral_payouts
  where user_id = p_user_id and status <> 'denied';

  if p_method = 'robux' then
    available := greatest(0, earned_robux - reserved_robux);
    if p_amount > available then
      return jsonb_build_object('ok', false, 'error', 'Amount exceeds your available Robux balance.');
    end if;
    insert into public.referral_payouts (user_id, method, status, amount_robux)
    values (p_user_id, p_method, 'requested', round(p_amount));
  else
    available := greatest(0, earned_usd - reserved_usd);
    if p_amount > available then
      return jsonb_build_object('ok', false, 'error', 'Amount exceeds your available USD balance.');
    end if;
    insert into public.referral_payouts (user_id, method, status, amount_usd)
    values (p_user_id, p_method, 'requested', round(p_amount, 2));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_referral_payout(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.request_referral_payout(uuid, text, numeric) to service_role;
