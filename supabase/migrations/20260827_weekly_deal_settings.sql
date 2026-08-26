-- Singleton settings row for the weekly-deals algorithm. Previously
-- MAX_DISCOUNT_PCT (40) and DISCOUNT_STEP_PCT (5) were hardcoded constants
-- in admin-weekly-deals/index.ts - changing the cap meant editing and
-- redeploying the function. Same public-read/service-write shape as
-- site_status: every admin panel load reads it, only the Edge Function
-- (service role, is_admin gated) writes it.
create table if not exists public.weekly_deal_settings (
  id boolean primary key default true,
  max_discount_pct integer not null default 40 check (max_discount_pct > 0 and max_discount_pct <= 90),
  discount_step_pct integer not null default 5 check (discount_step_pct > 0 and discount_step_pct <= max_discount_pct),
  updated_at timestamptz not null default now(),
  constraint weekly_deal_settings_singleton check (id)
);

insert into public.weekly_deal_settings (id) values (true) on conflict (id) do nothing;

alter table public.weekly_deal_settings enable row level security;

drop policy if exists "weekly_deal_settings_select_public" on public.weekly_deal_settings;
create policy "weekly_deal_settings_select_public" on public.weekly_deal_settings
  for select using (true);
