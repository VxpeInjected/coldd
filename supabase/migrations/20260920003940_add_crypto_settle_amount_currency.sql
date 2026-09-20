alter table public.orders
  add column if not exists crypto_settle_amount numeric,
  add column if not exists crypto_settle_currency text;

comment on column public.orders.crypto_settle_amount is 'Amount actually invoiced to the crypto provider, in crypto_settle_currency. Needed because RelayPay settles in AUD while total_usd stays USD; the webhook verifies against this figure, not total_usd, to avoid a currency mismatch.';
comment on column public.orders.crypto_settle_currency is 'Currency crypto_settle_amount is denominated in (e.g. usd, aud). Null for non-crypto orders.';
