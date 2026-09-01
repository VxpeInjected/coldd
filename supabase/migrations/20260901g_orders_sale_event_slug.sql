-- Sale events (content type 'sale_event') now apply a real discount at
-- checkout, not just the announcement bar. Record which one was in effect
-- on the order, next to coupon_code / campaign_code, so a discount with no
-- coupon behind it is explainable on the receipt and in analytics.
alter table public.orders
  add column if not exists sale_event_slug text;
