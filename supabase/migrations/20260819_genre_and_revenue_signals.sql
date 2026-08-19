-- Genre detection: no genre field exists on products, so this derives one
-- from title + description + category + subcategory text against a fixed
-- keyword list, rather than requiring every product to be manually tagged
-- (which nothing currently populates, so it would just always be empty).
-- immutable, not stable - it's a pure function of its text inputs, nothing
-- else, which is what lets Postgres treat repeated calls as free to fold.
create or replace function public.product_genres(p_title text, p_desc text, p_cat text, p_subcat text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(g), '{}')
  from unnest(array[
    'simulator','tycoon','obby','fighting','survival','roleplay','horror',
    'racing','sandbox','shooter','rpg','battle royale','parkour','clicker',
    'idle','hub','lobby','pvp','adventure','puzzle','building','sports',
    'stealth','tower defense','minigame','anime','zombie','escape'
  ]) as g
  where (lower(coalesce(p_title, '')) || ' ' || lower(coalesce(p_desc, '')) || ' ' || lower(coalesce(p_cat, '')) || ' ' || lower(coalesce(p_subcat, ''))) like '%' || g || '%';
$$;

-- A signed-in user's genre interests: every genre detected across every
-- product they've actually paid for. "Bought a simulator map" generalizes
-- to "show them more simulator products" regardless of category label,
-- since two simulator products can sit in completely different catalog
-- categories (a simulator MAP vs a simulator SCRIPT SYSTEM).
create or replace function public.get_user_genres(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct g), '{}')
  from order_items oi
  join orders o on o.id = oi.order_id and o.status = 'paid'
  join products p on p.id = oi.product_id
  cross join lateral unnest(public.product_genres(p.title, p.description, p.cat, p.subcat)) as g
  where o.user_id = p_user_id;
$$;
grant execute on function public.get_user_genres(uuid) to authenticated;

-- Real revenue per product from actual paid orders - the strongest, most
-- honest "will this make money" signal available: not a price guess, what
-- has actually sold before. Whole catalog, not per-user, so it's fetched
-- once per page load rather than once per product.
create or replace function public.get_catalog_revenue()
returns table (product_slug text, revenue numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.slug as product_slug, sum(oi.unit_price_usd * oi.qty) as revenue
  from order_items oi
  join orders o on o.id = oi.order_id and o.status = 'paid'
  join products p on p.id = oi.product_id
  where oi.licence <> 'resell'
  group by p.slug;
$$;
grant execute on function public.get_catalog_revenue() to anon, authenticated;
