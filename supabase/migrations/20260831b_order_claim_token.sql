-- One-time access token for GUEST orders (no user_id). Minted at order
-- creation, handed back only in the payment provider's success redirect
-- (?t=), stored here only as a SHA-256 hash. Required by
-- get-order-by-session / get-download-url / submit-reseller-info for guest
-- orders so a bare Stripe session id (which also appears in the Stripe
-- dashboard and webhook logs) is no longer enough on its own.
--
-- Account orders ignore this column entirely - they require a matching JWT.

alter table public.orders
  add column if not exists claim_token_hash text;
