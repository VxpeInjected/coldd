-- The site-wide "get 10% off for your email" popup mints a real one-time
-- coupon (mintOneTimeCoupon) the moment someone signs up - stored here so
-- a repeat visitor who re-submits the same email gets their EXISTING code
-- back instead of a fresh one every time (which would let someone farm
-- unlimited single-use 10% codes just by resubmitting the popup).
alter table public.marketing_optins add column if not exists discount_code text;
