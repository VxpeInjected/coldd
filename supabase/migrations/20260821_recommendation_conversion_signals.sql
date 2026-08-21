-- Brings the shop grid's "Recommended" sort logic (app.js's
-- conversionScore()) into get_recommended_for_user - the dashboard's
-- "Recommended for you" card used to rank purely by rating/review count
-- with zero regard for price or real revenue, unlike every other
-- "recommended" surface on the site. Same signals, same shapes (log-damped
-- price/revenue so neither one alone can bury quality), reused here
-- instead of reinvented.
--
-- Genre match is weighted well above everything else here specifically -
-- "you bought a simulator map, here's another simulator thing" is a much
-- stronger personal signal on a dashboard the user came to on purpose than
-- it is as one of many tie-breakers on a public storefront grid.
--
-- The category-affinity join (bought_cats) stays as the base filter, not
-- just another boost - without it this stops being "for you" and turns
-- into a generic bestseller list with a genre tiebreak.
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
  ),
  user_genres as (
    select unnest(public.get_user_genres(p_user_id)) as g
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
      (case when p.priority then 200 else 0 end)
      + (case when exists (
          select 1 from unnest(public.product_genres(p.title, p.description, p.cat, p.subcat)) pg
          join user_genres ug on ug.g = pg
        ) then 120 else 0 end)
      + (coalesce(p.rating, 0) * 2 + ln(1 + coalesce(p.reviews_count, 0))) * 10
      + (case when p.was_price > p.price_usd and p.was_price > 0
              then 15 + (1 - p.price_usd / p.was_price) * 100 * 0.3
              else 0 end)
      + greatest(0, 20 - extract(epoch from (now() - p.created_at)) / 86400 / 3)
      + ln(1 + p.price_usd) * 4
      + ln(1 + coalesce((select rev from revenue where revenue.product_id = p.id), 0)) * 6
      + (case when p.resell_available then 8 else 0 end)
    )::numeric as score
  from products p
  join bought_cats bc on bc.platform = p.platform and bc.cat = p.cat
  where p.is_active
    and p.id not in (select product_id from owned)
  order by score desc
  limit p_limit;
$$;
grant execute on function public.get_recommended_for_user(uuid, integer) to authenticated;
