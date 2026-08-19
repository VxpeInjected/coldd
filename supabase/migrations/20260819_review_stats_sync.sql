-- products.reviews_count / products.rating were static columns, never
-- touched by anything that writes to the real reviews table (creation,
-- moderation approve/hide, deletion) - so every star badge and review
-- count shown anywhere except the actual review cards themselves (shop
-- grid, product page overview, JSON-LD aggregateRating) was permanently
-- stale, disconnected data. This keeps them correct automatically: a
-- trigger recalculates both from real approved reviews on every write to
-- the reviews table, and the one-time backfill below fixes every product
-- that's already out of sync.

create or replace function public.recalc_product_review_stats(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products p
  set reviews_count = agg.cnt,
      rating = coalesce(agg.avg_stars, 0)
  from (
    select count(*) as cnt, avg(stars) as avg_stars
    from reviews
    where product_id = p_product_id and status = 'approved'
  ) agg
  where p.id = p_product_id;
end;
$$;

create or replace function public.reviews_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform recalc_product_review_stats(OLD.product_id);
    return OLD;
  end if;

  perform recalc_product_review_stats(NEW.product_id);
  if TG_OP = 'UPDATE' and OLD.product_id is distinct from NEW.product_id then
    perform recalc_product_review_stats(OLD.product_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reviews_stats on public.reviews;
create trigger trg_reviews_stats
after insert or update or delete on public.reviews
for each row execute function public.reviews_stats_trigger();

-- Backfill: fix every product's count/rating right now, not just future writes.
select recalc_product_review_stats(id) from public.products;
