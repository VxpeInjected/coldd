-- product_legal.max_discount_pct
--
-- The largest percentage discount any sale event, coupon, weekly deal,
-- bundle, cross-sell, or automatic spend-tier offer is allowed to take off
-- this product's standard (list) price. It sits alongside the two limits
-- product_legal already has:
--
--   min_sale_usd / min_sale_robux  - an absolute price floor
--   disallow_sales                 - no discount at all, ever
--   max_discount_pct  (new)        - a cap on the discount PERCENTAGE
--
-- Whichever of these bites first wins. 0 means "no percentage cap", which
-- is the default, so every existing row keeps its current behaviour.
alter table public.product_legal
  add column if not exists max_discount_pct numeric(5,2) not null default 0
    check (max_discount_pct >= 0 and max_discount_pct <= 100);

-- get_checkout_cross_sell also returns the exact price the checkout will
-- honour for a suggested add-on, so it has to respect the new cap the same
-- way it already respects min_sale_usd / disallow_sales.
drop function if exists public.get_checkout_cross_sell(text[], integer);

create function public.get_checkout_cross_sell(p_slugs text[], p_limit integer default 3)
returns table (
  product_slug   text,
  list_price_usd numeric,
  deal_price_usd numeric,
  score          numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with cart as (
    select p.id, p.slug, p.platform, p.cat, p.subcat,
           public.product_genres(p.title, p.description, p.cat, p.subcat) as genres
    from products p
    where p.slug = any(p_slugs)
  ),
  cart_platforms as (select distinct platform from cart),
  cart_cats      as (select distinct cat from cart),
  cart_subcats   as (select distinct subcat from cart where subcat is not null and subcat <> ''),
  cart_genres    as (select distinct g from cart cross join lateral unnest(cart.genres) as g),
  revenue as (
    select oi.product_id, sum(oi.unit_price_usd * oi.qty) as rev
    from order_items oi
    join orders o on o.id = oi.order_id and o.status = 'paid'
    where oi.licence <> 'resell'
    group by oi.product_id
  ),
  cand as (
    select p.id, p.slug, p.price_usd,
      pl.min_sale_usd as min_sale_usd,
      coalesce(pl.max_discount_pct, 0) as max_discount_pct,
      coalesce(pl.disallow_sales, false) as disallow_sales,
      (case when exists (
          select 1
          from unnest(public.product_genres(p.title, p.description, p.cat, p.subcat)) as pg
          join cart_genres cg on cg.g = pg
        ) then 3 else 0 end)
      + (case when p.cat in (select cat from cart_cats) then 2 else 0 end)
      + (case when p.subcat in (select subcat from cart_subcats) then 1 else 0 end) as relevance,
      (
        (coalesce(p.rating, 0) * 2 + ln(1 + coalesce(p.reviews_count, 0))) * 10
        + ln(1 + p.price_usd) * 4
        + ln(1 + coalesce((select rev from revenue where revenue.product_id = p.id), 0)) * 6
      )::numeric as conv
    from products p
    left join product_legal pl on pl.product_id = p.id
    where p.is_active
      and not (p.slug = any(p_slugs))
      and p.platform in (select platform from cart_platforms)
  ),
  priced as (
    select c.*,
      c.price_usd as list_price_usd,
      case
        when c.disallow_sales then c.price_usd
        else greatest(
          round(c.price_usd * 0.90, 2),
          coalesce(c.min_sale_usd, 0),
          case when c.max_discount_pct > 0
            then round(c.price_usd * (1 - c.max_discount_pct / 100.0), 2)
            else 0 end
        )
      end as deal_price_usd
    from cand c
  )
  select
    slug as product_slug,
    list_price_usd,
    least(deal_price_usd, list_price_usd) as deal_price_usd,
    (relevance * 100000 + conv) as score
  from priced
  order by score desc
  limit greatest(1, coalesce(p_limit, 3));
$$;

grant execute on function public.get_checkout_cross_sell(text[], integer) to anon, authenticated;
