-- supabase/security_hardening_2026-09-09.sql
--
-- Run once in Supabase Dashboard -> SQL Editor, or `supabase db push`.
-- Every statement is idempotent. Findings from the 2026-09-09 security pass.
-- Ordered most-severe first.

-- ============================================================================
-- 1. CRITICAL - privilege escalation via profiles UPDATE
-- ============================================================================
-- profiles has RLS `profiles_update_own USING (auth.uid() = id)` and the
-- anon/authenticated roles held table-wide UPDATE. Any signed-in user could
--   PATCH /rest/v1/profiles?id=eq.<self>  { "is_admin": true, "role": "owner" }
-- with their anon-key JWT. Every admin-* Edge Function trusts
-- profiles.is_admin, so this was full store takeover (read all orders/PII,
-- delete products, mint coupons, manage payouts). A banned user could also
-- clear their own `banned` flag, and anyone could set `email_verified` or
-- claim a `roblox_id` used by Robux-ownership checks.
--
-- Fix: column-level UPDATE grants. Users may write only the columns the
-- browser actually sets (Account Settings, the OAuth callbacks, the
-- notification-prefs toggle). Everything privileged is service-role / cron
-- only. A PATCH touching a revoked column returns 403 and the allowed
-- columns in the same request still apply.

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;

grant update (
  username, email, avatar_url, updated_at,
  discord_id, guilds, member_info,
  notification_prefs, marketing_unsubscribed, id
) on public.profiles to authenticated;

grant update (
  username, email, avatar_url, updated_at,
  discord_id, guilds, member_info,
  notification_prefs, marketing_unsubscribed, id
) on public.profiles to anon;

-- Still revoked from anon/authenticated (service role / cron only):
--   is_admin, role, banned, ban_reason, email_verified, referred_by,
--   referral_code, referral_clicks, email_unsub_token,
--   reengagement_email_sent_at, created_at, roblox_id


-- ============================================================================
-- 2. HIGH - internal-only pool RPCs are callable by the public
-- ============================================================================
-- These SECURITY DEFINER functions are only ever invoked from
-- supabase/functions/_shared/roblox_pool.ts with the service-role client,
-- but anon/authenticated hold EXECUTE, so a signed-in caller who has an
-- order UUID (their own Robux order is enough) could call
--   set_roblox_pass_price(<order>, 1)   -- pay 1 Robux
--   release_roblox_pass(<order>)        -- grief the pass pool
-- No client code calls these, so revoking EXECUTE has no functional impact.

revoke execute on function public.set_roblox_pass_price(uuid, integer) from anon, authenticated;
revoke execute on function public.release_roblox_pass(uuid)             from anon, authenticated;
revoke execute on function public.increment_order_pass_switch_count(uuid) from anon, authenticated;
revoke execute on function public.lease_roblox_pass(uuid, integer)     from anon, authenticated;
revoke execute on function public.lease_roblox_pass(uuid, integer, text[]) from anon, authenticated;


-- ============================================================================
-- 3. HIGH - store revenue exposed to every visitor
-- ============================================================================
-- app.js loadCatalogRevenue() called get_catalog_revenue() UNAUTHENTICATED on
-- the public shop (feeds the "recommended" sort), so every visitor's Network
-- tab showed coldd's real per-product paid revenue in USD.
--
-- (a) get_catalog_revenue() keeps returning raw dollars but now only to
--     admins - the admin panel (admin.js) still uses it, nobody else can.
create or replace function public.get_catalog_revenue()
returns table(product_slug text, revenue numeric)
language sql stable security definer set search_path = public
as $$
  select p.slug as product_slug, sum(oi.unit_price_usd * oi.qty) as revenue
  from order_items oi
  join orders o on o.id = oi.order_id and o.status = 'paid'
  join products p on p.id = oi.product_id
  where oi.licence <> 'resell' and public.is_admin()
  group by p.slug;
$$;

-- (b) new normalised function for the public shop sort: each product's paid
--     revenue as a 0..1 ratio against the best seller. Never leaves $$.
--     app.js now calls this instead (rpc 'catalog_revenue_rank'); the call
--     fails closed if this migration hasn't run yet, and the sort still works.
create or replace function public.catalog_revenue_rank()
returns table(product_slug text, rank numeric)
language sql stable security definer set search_path = public
as $$
  with rev as (
    select p.slug, sum(oi.unit_price_usd * oi.qty) as revenue
    from order_items oi
    join orders o on o.id = oi.order_id and o.status = 'paid'
    join products p on p.id = oi.product_id
    where oi.licence <> 'resell'
    group by p.slug
  )
  select slug as product_slug,
         round((revenue / nullif(max(revenue) over (), 0))::numeric, 4) as rank
  from rev;
$$;
grant execute on function public.catalog_revenue_rank() to anon, authenticated;


-- ============================================================================
-- 4. LOW - mutable search_path on a SECURITY DEFINER function
-- ============================================================================
-- Supabase advisor 0011. Pin it so the function can't be redirected by a
-- caller-set search_path.
alter function public.product_genres(text, text, text, text) set search_path = public;


-- ============================================================================
-- NOT SQL - do these in the dashboard:
-- ============================================================================
-- * Enable "Leaked password protection" (HaveIBeenPwned):
--   Dashboard -> Authentication -> Policies.
-- * Set a size limit on the `product-media` Storage bucket.
-- * Set an org spend cap: Dashboard -> Organization -> Billing.
