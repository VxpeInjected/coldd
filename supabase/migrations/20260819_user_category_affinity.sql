-- Backs the catalog's per-user "interest" boost: the categories/platforms
-- a signed-in visitor has actually bought from before. Returns raw
-- category pairs rather than specific products (unlike
-- get_recommended_for_user) because the catalog page needs to boost
-- EXISTING cards already on the page, not fetch new ones to show.
create or replace function public.get_user_categories(p_user_id uuid)
returns table (platform text, cat text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.platform, p.cat
  from order_items oi
  join orders o on o.id = oi.order_id and o.status = 'paid'
  join products p on p.id = oi.product_id
  where o.user_id = p_user_id;
$$;
grant execute on function public.get_user_categories(uuid) to authenticated;
