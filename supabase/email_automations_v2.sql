-- Second wave of lifecycle email automations (2026-09).
--
-- Adds 7 more rows to email_automations (all disabled by default, same as
-- the first five) and a single generic per-send dedupe table so future
-- automations don't each need their own *_sent_at column.
--
-- Run once in the SQL editor. Then redeploy cron-lifecycle-emails.

create table if not exists public.email_automation_sends (
  automation_key text not null,
  dedupe_key text not null,          -- user_id, order_id, order_item_id, or a composite
  sent_at timestamptz not null default now(),
  primary key (automation_key, dedupe_key)
);
alter table public.email_automation_sends enable row level security;
-- Service-role only (cron-lifecycle-emails). No client policies = deny all.

insert into public.email_automations (key, enabled, delay_hours, subject, body_md) values
  ('signup_nudge', false, 48, 'Anything catch your eye?',
   'Thanks for signing up. You haven''t made a purchase yet - here''s a quick way back into the catalog if you were still looking.'),

  ('wishlist_price_drop', false, 6, 'Something on your wishlist just dropped in price',
   'An item you saved is on sale right now. The lower price is applied automatically at checkout - no code needed.'),

  ('getting_started', false, 2, 'Getting started with your coldd files',
   'Your files are ready in your dashboard. Here''s how to get them into your game, and where to ask if you get stuck.'),

  ('resell_upgrade', false, 168, 'Sell what you built with this',
   'You own a standard usage licence for this product. If you want to resell it under your own store, you can upgrade the licence any time - you only pay the difference.'),

  ('review_incentive', false, 240, 'Leave a review, get a code',
   'You bought from us a little while ago and haven''t left a review yet. Write one and we''ll send a discount code for your next order as a thank-you.'),

  ('repeat_buyer', false, 24, 'Thanks for coming back',
   'That''s not your first order with us - thank you. Here''s a code for your next one.'),

  ('winback', false, 2160, 'It''s been a while - here''s a bigger reason to come back',
   'You haven''t ordered in a few months. The catalog has moved on a lot since then, and there''s a discount waiting for you below.')
on conflict (key) do nothing;
