-- Replaces the fixed genre keyword list (product_genres/get_user_genres)
-- with something that doesn't need a human to keep expanding it every time
-- the catalog grows a new kind of product. Instead of matching against a
-- list of words someone had to think of in advance, this derives
-- "genre-like" terms straight from the catalog's own text: extract every
-- word and word-pair (unigram/bigram) from each product's title +
-- description, then keep only the ones that recur across a MEANINGFUL
-- SLICE of the catalog - not just one product (too specific to mean
-- anything, "the flavor text of this one item") and not almost every
-- product (too generic, "roblox", "the", "pack" - noise, not a genre).
-- That middle band is what actually behaves like a genre/theme tag:
-- "simulator", "full game", "brainrot" all qualify the same way, purely
-- because multiple products happen to share them - nobody has to notice
-- "brainrot" is a genre now and go add it to a list.
drop function if exists public.get_user_genres(uuid);
drop function if exists public.product_genres(text, text, text, text);

create or replace function public.catalog_signal_terms()
returns table (product_id uuid, product_slug text, terms text[])
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id, p.slug,
      -- lower() BEFORE regexp_replace, not after - the [^a-z0-9] class is
      -- lowercase-only, so applying it to still-mixed-case text treated
      -- every capital letter as punctuation and stripped it, truncating
      -- the first letter off nearly every capitalized word ("Skyblock"
      -- became "kyblock", "Pack" became "ack").
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p.title, '') || ' ' || coalesce(p.description, '')), '[^a-z0-9]+', ' ', 'g'),
        '\s+'
      ) as words
    from products p
    where p.is_active
  ),
  tokens as (
    select b.id, b.slug, t.w, t.ord
    from base b, unnest(b.words) with ordinality as t(w, ord)
  ),
  filtered as (
    select * from tokens
    where length(w) > 2 and w <> '' and w not in (
      'the','and','for','with','from','this','that','your','you','are','all','not','but','can','has','have',
      'roblox','minecraft','coldd','game','games','product','products','pack','kit','system','free',
      'includes','included','use','used','ready','fully','well','more','get','our','their','its',
      'one','two','set','new','over','into','out','also','via','per','any','way','how','who','what',
      'file','files','support','update','updates','version'
    )
  ),
  unigrams as (
    select id, slug, w as term from filtered
  ),
  bigrams as (
    select a.id, a.slug, a.w || ' ' || b.w as term
    from filtered a
    join filtered b on b.id = a.id and b.ord = a.ord + 1
  ),
  all_terms as (
    select id, slug, term from unigrams
    union all
    select id, slug, term from bigrams
  ),
  df as (
    select term, count(distinct id) as doc_freq
    from all_terms
    group by term
  ),
  total as (select count(*) as n from base),
  -- Recurs in at least 2 products, but not in more than 40% of the active
  -- catalog - the band that separates "one-off flavor text" and "generic
  -- filler word" from "an actual recurring pattern".
  significant as (
    select at.id, at.slug, at.term
    from all_terms at
    join df on df.term = at.term
    cross join total
    where df.doc_freq >= 2 and df.doc_freq <= greatest(2, total.n * 0.4)
  )
  select id as product_id, slug as product_slug, coalesce(array_agg(distinct term), '{}') as terms
  from significant
  group by id, slug;
$$;
grant execute on function public.catalog_signal_terms() to anon, authenticated;

-- A signed-in user's own signal terms: the union of significant terms
-- across every product they've actually paid for.
create or replace function public.get_user_signal_terms(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct term), '{}')
  from public.catalog_signal_terms() cst
  join order_items oi on oi.product_id = cst.product_id
  join orders o on o.id = oi.order_id and o.status = 'paid'
  cross join lateral unnest(cst.terms) as term
  where o.user_id = p_user_id;
$$;
grant execute on function public.get_user_signal_terms(uuid) to authenticated;
