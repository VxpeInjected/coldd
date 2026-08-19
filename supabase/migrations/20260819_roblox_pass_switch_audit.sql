-- Audit trail for mid-order gamepass switches (buyer already owned the
-- pass they were leased, so verify-robux-order released it and leased a
-- fresh one for the SAME order rather than closing it out). Without this,
-- an order that went through a switch was indistinguishable from a normal
-- single-pass order once it completed - no way to tell "this buyer's
-- purchase attempt on gamepass X was a real no-op" apart from "gamepass X
-- just hasn't been bought yet", which matters for support and for
-- auditing that the already-owned defense is actually working.
create table if not exists public.roblox_pass_switches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_gamepass_id text not null,
  to_gamepass_id text,
  reason text not null default 'already_owned',
  switched_at timestamptz not null default now()
);
create index if not exists roblox_pass_switches_order_id_idx on public.roblox_pass_switches(order_id);

alter table public.orders add column if not exists roblox_pass_switch_count integer not null default 0;

create or replace function public.increment_order_pass_switch_count(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders set roblox_pass_switch_count = roblox_pass_switch_count + 1 where id = p_order_id;
$$;
