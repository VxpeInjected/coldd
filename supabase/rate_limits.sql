-- Run once in Supabase Dashboard -> SQL Editor. Idempotent.
--
-- Generic fixed-window rate limiter, backed by one small table and one
-- atomic RPC - same "UPSERT does the check-and-increment in one statement"
-- pattern already used by increment_roblox_container and
-- request_referral_payout, so concurrent callers can't race past the limit.
--
-- No client policies at all: this table is never read or written directly
-- by the browser, only through check_rate_limit() below, called from
-- service-role Edge Functions.

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

-- security definer so it can run as its owner regardless of caller role;
-- there are no grants to anon/authenticated, so only the service-role
-- Postgres connection (which bypasses RLS/grants entirely) can call it,
-- same trust boundary as every other admin.rpc(...) call in this codebase.
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when public.rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then 1
        else public.rate_limits.count + 1
      end,
    window_start = case
      when public.rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then now()
        else public.rate_limits.window_start
      end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;
