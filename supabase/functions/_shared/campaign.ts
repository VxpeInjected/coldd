// supabase/functions/_shared/campaign.ts
//
// Shared by the four order-creation functions (create-checkout-session,
// create-paypal-order, create-crypto-charge, create-robux-order) so a
// campaign code only ever lands on an order if it matches a real, active
// campaign_links row - an unrecognized or stale code is silently dropped
// rather than polluting the campaign list with junk values, same
// "fail open, never block checkout" posture as coupon resolution.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function resolveCampaignCode(admin: SupabaseClient, raw: unknown): Promise<string | null> {
  const code = String(raw || "").trim().toLowerCase();
  if (!code) return null;
  const { data } = await admin.from("campaign_links").select("code").eq("code", code).eq("active", true).maybeSingle();
  return data ? data.code : null;
}
