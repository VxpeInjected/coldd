-- bundle_deals shipped with RLS enabled and zero policies (service-role
-- only, same as coupons/product_legal at the time) since nothing needed
-- to read it except the redemption path. Now that the Sales/Discounts
-- admin panel wants to list currently-active bundle deals (they're
-- auto-minted, not admin-created, but still worth being able to see),
-- give admins the same read-only access coupons already have.
create policy bundle_deals_select_admin on public.bundle_deals
  for select using (is_admin());
