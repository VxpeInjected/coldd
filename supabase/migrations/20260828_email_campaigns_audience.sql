-- 'marketing'   - the default. Goes only to real opt-ins (marketing_optins,
--                 unsubscribed_at is null). Carries a discount incentive.
-- 'announcement'- service messages every account needs to see (ToS changes,
--                 outages). Goes to every account with a real email,
--                 regardless of marketing opt-in / unsubscribe state.
alter table public.email_campaigns
  add column if not exists audience text not null default 'marketing'
  check (audience in ('marketing', 'announcement'));
