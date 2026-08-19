-- Real recommendation signal from actual purchase behavior, not just
-- content similarity (same category/subcat/title-word-overlap - which is
-- all product.html's "related products" used before, and is still useful
-- as a fallback for a product with no purchase history yet, just not the
-- whole story).
--
-- Both functions take/return slugs, not the internal uuid - the client
-- only ever deals in slugs (window.__CATALOG is keyed by slug), so
-- resolving that here avoids every caller needing its own lookup round
-- trip first.

-- "Customers who bought this also bought": for a given product, find
-- other products that showed up in the same PAID orders, ranked by how
-- often that's happened. This is the standard co-purchase-affinity
-- approach - no external ML service, just counting real order history,
-- which is exactly the kind of thing SQL is good at and a JS blend of
-- category/title scoring can never actually know.
create or replace function public.get_also_bought(p_slug text, p_limit integer default 8)
returns table (product_slug text, co_purchases bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p2.slug as product_slug, count(distinct oi1.order_id) as co_purchases
  from products p1
  join order_items oi1 on oi1.product_id = p1.id
  join orders o on o.id = oi1.order_id and o.status = 'paid'
  join order_items oi2 on oi2.order_id = oi1.order_id and oi2.product_id <> oi1.product_id
  join products p2 on p2.id = oi2.product_id
  where p1.slug = p_slug
  group by p2.slug
  order by co_purchases desc
  limit p_limit;
$$;
grant execute on function public.get_also_bought(text, integer) to anon, authenticated;

-- "Recommended for you": products in the same categories/platforms as
-- what a signed-in user has already bought, excluding anything they
-- already own, weighted toward higher-rated and more-reviewed products
-- so a recommendation isn't just "another thing in that category" but
-- "another thing in that category people actually liked".
create or replace function public.get_recommended_for_user(p_user_id uuid, p_limit integer default 8)
returns table (product_slug text, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with owned as (
    select distinct oi.product_id
    from order_items oi
    join orders o on o.id = oi.order_id and o.status = 'paid'
    where o.user_id = p_user_id
  ),
  bought_cats as (
    select distinct p.platform, p.cat
    from owned
    join products p on p.id = owned.product_id
  )
  select p.slug as product_slug,
    (coalesce(p.rating, 0) * 2 + ln(1 + coalesce(p.reviews_count, 0)))::numeric as score
  from products p
  join bought_cats bc on bc.platform = p.platform and bc.cat = p.cat
  where p.is_active
    and p.id not in (select product_id from owned)
  order by score desc
  limit p_limit;
$$;
grant execute on function public.get_recommended_for_user(uuid, integer) to authenticated;
