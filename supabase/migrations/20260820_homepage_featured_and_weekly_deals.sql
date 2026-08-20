-- Featured products (homepage "Featured products" grid): admin picks which
-- products show and in what order. Manual only, no algorithm.
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists featured_order integer not null default 0;

-- Weekly deals (homepage "This week's deals" grid): a scheduled algorithm
-- (run-weekly-deals edge function) picks products and discounts them by
-- writing price_usd/was_price directly - the same was_price mechanic the
-- admin product editor's "Was price" field already uses for manual sales,
-- so display/checkout code needs no changes at all.
--
-- weekly_deal_auto distinguishes an algorithm-set discount from a manual
-- one an admin set via the ordinary Was Price field, so the weekly job only
-- ever touches products it put on sale itself - never a human's own sale.
alter table public.products add column if not exists weekly_deal boolean not null default false;
alter table public.products add column if not exists weekly_deal_pct numeric;
alter table public.products add column if not exists weekly_deal_auto boolean not null default false;
-- Admin opt-out - the algorithm skips these even if they'd otherwise score
-- well, without having to also mark them disallow_sales (which blocks
-- coupons/sale events too, a broader lockout than "just not this feature").
alter table public.products add column if not exists weekly_deal_excluded boolean not null default false;

create index if not exists products_featured_idx on public.products (featured, featured_order) where featured = true;
create index if not exists products_weekly_deal_idx on public.products (weekly_deal) where weekly_deal = true;
