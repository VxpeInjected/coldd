-- Admin-settable manual boost for the catalog's Recommended sort - lets
-- staff push a specific product to the front regardless of what its real
-- rating/reviews/sale/recency signals alone would earn it (a new launch
-- with no reviews yet, a strategic push, etc).
alter table public.products add column if not exists priority boolean not null default false;
