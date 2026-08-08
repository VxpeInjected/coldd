-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Columns for the direct PayPal Orders API integration (create-paypal-order /
-- capture-paypal-order). The card flow keeps using stripe_session_id /
-- stripe_payment_intent_id; these sit alongside rather than replacing them, so
-- an order carries the references for exactly the provider that handled it.

alter table public.orders add column if not exists paypal_order_id text;
alter table public.orders add column if not exists paypal_capture_id text;

-- Which provider owns this order. Existing rows predate PayPal and were all
-- card, so they backfill to 'stripe'. Robux orders already carry their own
-- roblox_* columns and are set to 'robux' by create-robux-order.
alter table public.orders add column if not exists payment_provider text;
update public.orders set payment_provider = 'stripe' where payment_provider is null;

-- capture-paypal-order looks an order up by its PayPal id when reconciling, and
-- the uniqueness matters: two coldd orders must never claim the same PayPal
-- order, or a single payment could fulfil both.
create unique index if not exists orders_paypal_order_id_key
  on public.orders (paypal_order_id)
  where paypal_order_id is not null;

create index if not exists orders_payment_provider_idx
  on public.orders (payment_provider);
