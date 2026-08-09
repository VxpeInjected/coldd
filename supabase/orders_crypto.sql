-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Columns for crypto checkout. Provider-agnostic on purpose: the first
-- implementation is NOWPayments, but Coinbase Commerce was ruled out mid-build
-- for being unavailable to Australian merchants, so nothing here is named after
-- a vendor.

alter table public.orders add column if not exists crypto_provider text;
alter table public.orders add column if not exists crypto_charge_id text;
-- The provider's own payment/invoice reference, recorded when the settlement
-- webhook is accepted. Kept separate from crypto_charge_id because the invoice
-- and the payment against it are different objects.
alter table public.orders add column if not exists crypto_payment_id text;

-- One coldd order per provider charge. Without this, a replayed or duplicated
-- callback could in principle be correlated to a second order and fulfil it.
create unique index if not exists orders_crypto_charge_id_key
  on public.orders (crypto_charge_id)
  where crypto_charge_id is not null;

create index if not exists orders_crypto_payment_idx
  on public.orders (crypto_payment_id)
  where crypto_payment_id is not null;
