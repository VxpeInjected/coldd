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
-- 3. LOW - mutable search_path on a SECURITY DEFINER function
-- ============================================================================
-- Supabase advisor 0011. Pin it so the function can't be redirected by a
-- caller-set search_path.
alter function public.product_genres(text, text, text, text) set search_path = public;


-- ============================================================================
-- NOT fixed here - needs a product decision, see the security report:
-- ============================================================================
-- * get_catalog_revenue() is called UNAUTHENTICATED from the public shop
--   page (app.js loadCatalogRevenue, feeds the "recommended" sort), so every
--   visitor's browser downloads coldd's real per-product paid revenue. The
--   fix is to return a normalised 0-1 ranking score from the server instead
--   of raw dollars, or bucket the figure - both change the ranking feature,
--   so they're left for you to sign off on.
-- * Enable "Leaked password protection" (HaveIBeenPwned) in
--   Dashboard -> Authentication -> Policies. Not SQL.
