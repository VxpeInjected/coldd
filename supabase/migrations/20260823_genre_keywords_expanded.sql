-- The original keyword list (20260819_genre_and_revenue_signals.sql) was
-- missing several of the most common real Roblox/Minecraft genres outright
-- - "brainrot" (the exact genre the post-purchase upsell's own feature
-- request used as its example), "skyblock" and "prison" (both literally
-- present in real product descriptions and still matching nothing), plus
-- a batch of others. Checked against the live catalog: roughly half of all
-- active products detected ZERO genres under the old list, which silently
-- breaks every feature built on product_genres (dashboard recommendations,
-- checkout cross-sell, the post-purchase upsell) for anything bought
-- alongside one of those products - not "picks something unrelated", but
-- "has nothing to go on at all" for a large slice of the catalog.
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
    'stealth','tower defense','minigame','anime','zombie','escape',
    'brainrot','skyblock','prison','jailbreak','military','murder mystery',
    'deathrun','hide and seek','egg hunt','natural disaster','farming',
    'mining','crafting','economy','dungeon','restaurant','cooking',
    'hospital','fps','open world','fantasy','medieval','space','pirate',
    'western','crime','heist'
  ]) as g
  where (lower(coalesce(p_title, '')) || ' ' || lower(coalesce(p_desc, '')) || ' ' || lower(coalesce(p_cat, '')) || ' ' || lower(coalesce(p_subcat, ''))) like '%' || g || '%';
$$;
