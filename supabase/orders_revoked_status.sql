-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Adds 'revoked' as a real order status - distinct from 'refunded'. A
-- refund always means Stripe actually returned the money; revoke cuts off
-- download access (get-download-url's ownership check requires
-- status = 'paid') without touching payment, for cases like a policy
-- violation or a chargeback dispute where access should stop but the
-- money was never (or can't yet be) returned through this order record.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled', 'revoked'));
