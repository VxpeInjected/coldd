-- Records whether the checkout "Email me deals, drops, and product
-- updates" box was checked on this specific order - needed on the order
-- row (not just marketing_optins) because a guest's email isn't known
-- until the payment actually completes (Stripe/PayPal/crypto collect it on
-- their own hosted step, after this row is written), so the actual
-- marketing_optins upsert has to happen later, at the same completion
-- point sendOrderReceipt/resolveGiftReceipt already run from.
alter table public.orders add column if not exists marketing_opt_in boolean not null default false;
