alter table public.orders
  add column if not exists stripe_charge_amount numeric,
  add column if not exists stripe_charge_currency text;

comment on column public.orders.stripe_charge_amount is 'Amount actually charged via Stripe, in stripe_charge_currency. Differs from total_usd when the buyer picked a local payment method (Bancontact/BLIK/Pix/etc.) that only accepts a non-USD currency, converted at checkout time via a live rate.';
comment on column public.orders.stripe_charge_currency is 'Currency stripe_charge_amount is denominated in (usd for the default flow, or the local currency a specific payment method required). Null for non-Stripe orders.';
