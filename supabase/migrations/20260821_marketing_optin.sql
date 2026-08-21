-- Backs the checkout "Email me deals, drops, and product updates" box,
-- which now carries a 10% discount incentive. Tracked by email rather than
-- user_id alone because checkout doesn't require an account - a guest who
-- opts in still needs to be recorded and honoured on future sends even if
-- they never create a profile. Signed-in users ALSO get
-- profiles.notification_prefs.promotions synced to true so the existing
-- Notifications settings tab reflects reality instead of a separate,
-- invisible opt-in nobody can see or revoke from the account they're
-- signed into.
create table if not exists public.marketing_optins (
  email text primary key,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'checkout',
  subscribed_at timestamptz not null default now()
);

alter table public.marketing_optins enable row level security;
-- No public policies at all - service role only (edge functions), same as
-- coupons and product_legal. A visitor's own consent record is not
-- something the anon/authenticated roles need to read directly.
