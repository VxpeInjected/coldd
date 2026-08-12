-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- LIFECYCLE EMAIL AUTOMATIONS
--
-- Deliberately NOT using Resend's own Automations product (a separate,
-- dashboard-only visual workflow builder) - the whole point of this table
-- is that an admin controls timing/copy/on-off from coldd's own admin
-- panel, not a third-party UI. cron-lifecycle-emails reads this table on
-- every run, so editing a row here takes effect on the next cron tick with
-- no deploy.
--
-- Five fixed keys, seeded with sensible defaults and enabled = false -
-- nothing sends until an admin turns each one on deliberately.
--   abandoned_cart_1/2/3 - a 3-step cart recovery sequence. delay_hours is
--     measured from the cart going stale (cart_snapshots.updated_at), and
--     each step only fires once the previous one has (cart_snapshots.
--     abandoned_step_sent tracks progress). The sequence stops on its own
--     the moment the shopper buys or empties their cart, because that's
--     exactly when save-cart-snapshot deletes the row.
--   post_purchase_review - delay_hours after an order is marked paid.
--   reengagement - delay_hours is both "how old before we call the account
--     lapsed" and the resend cooldown, since this table intentionally
--     keeps one delay knob per row rather than growing a second field for
--     a distinction the admin panel doesn't need yet.

create table if not exists public.email_automations (
  key text primary key,
  enabled boolean not null default false,
  delay_hours integer not null,
  subject text not null default '',
  body_md text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.email_automations enable row level security;

do $$ begin
  create policy "email_automations_select_admin" on public.email_automations
    for select using (public.is_admin());
exception when duplicate_object then null;
end $$;

-- No client write policy - only admin-update-automation (service role)
-- writes, so every change is validated and audit-logged server-side.

insert into public.email_automations (key, enabled, delay_hours, subject, body_md) values
  ('abandoned_cart_1', false, 1, 'Still thinking it over?',
   'You left something in your cart. It''s still saved - pick up right where you left off.'),
  ('abandoned_cart_2', false, 24, 'Your cart is waiting (and so is a discount)',
   'Your cart is still here. If a nudge helps, use a code from your latest coupon at checkout.'),
  ('abandoned_cart_3', false, 72, 'Last call for your cart',
   'This is the last reminder - after this we''ll assume you''ve moved on and stop emailing about this cart.'),
  ('post_purchase_review', false, 72, 'How''s it going so far?',
   'Thanks again for your order. If you have a minute, a review helps other builders know what to expect.'),
  ('reengagement', false, 720, 'We miss you at coldd',
   'It''s been a while. Here''s what''s new since you last stopped by.')
on conflict (key) do nothing;

-- Per-cart progress through the 3-step sequence (0 = none sent yet).
alter table public.cart_snapshots
  add column if not exists abandoned_step_sent integer not null default 0;

-- Per-order review-request tracking.
alter table public.orders
  add column if not exists review_email_sent_at timestamptz;

-- Per-account re-engagement tracking.
alter table public.profiles
  add column if not exists reengagement_email_sent_at timestamptz;
