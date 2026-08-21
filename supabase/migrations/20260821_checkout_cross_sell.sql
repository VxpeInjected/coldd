-- Checkout's "people also get this" upsell: given the slugs already in the
-- cart, find OTHER active products that share a genre with something
-- already being bought (product_genres, same dynamic genre detection the
-- dashboard's Recommended for you now leans on), ranked by the same
-- quality/price/revenue shape conversionScore uses elsewhere. Works for
-- guests too, since it reads off the cart itself rather than purchase
-- history - a guest checkout has none of that to go on.
create or replace function public.get_checkout_cross_sell(p_slugs text[], p_limit integer default 3)
returns table (product_slug text, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with cart_genres as (
    select distinct g
    from products cp
    cross join lateral unnest(public.product_genres(cp.title, cp.description, cp.cat, cp.subcat)) as g
    where cp.slug = any(p_slugs)
  ),
  revenue as (
    select oi.product_id, sum(oi.unit_price_usd * oi.qty) as rev
    from order_items oi
    join orders o on o.id = oi.order_id and o.status = 'paid'
    where oi.licence <> 'resell'
    group by oi.product_id
  )
  select p.slug as product_slug,
    (
      (coalesce(p.rating, 0) * 2 + ln(1 + coalesce(p.reviews_count, 0))) * 10
      + ln(1 + p.price_usd) * 4
      + ln(1 + coalesce((select rev from revenue where revenue.product_id = p.id), 0)) * 6
    )::numeric as score
  from products p
  where p.is_active
    and not (p.slug = any(p_slugs))
    and exists (
      select 1
      from unnest(public.product_genres(p.title, p.description, p.cat, p.subcat)) pg
      join cart_genres cg on cg.g = pg
    )
  order by score desc
  limit p_limit;
$$;
grant execute on function public.get_checkout_cross_sell(text[], integer) to anon, authenticated;
