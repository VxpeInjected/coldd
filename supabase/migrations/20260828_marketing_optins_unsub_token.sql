-- A marketing campaign now sends to marketing_optins rows, not profiles -
-- and a guest opt-in (popup / checkout with no account) has no
-- profiles.email_unsub_token to build an unsubscribe link from. Give every
-- opt-in its own token so email-unsubscribe can honour a withdrawal
-- (sets marketing_optins.unsubscribed_at) whether or not an account exists.
alter table public.marketing_optins
  add column if not exists unsub_token uuid not null default gen_random_uuid();
create unique index if not exists marketing_optins_unsub_token_idx
  on public.marketing_optins (unsub_token);
