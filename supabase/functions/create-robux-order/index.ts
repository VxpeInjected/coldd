// supabase/functions/create-robux-order/index.ts
//
// Deploy with:
//   supabase functions deploy create-robux-order
//
// Robux checkout doesn't go through Stripe - Roblox handles the actual
// payment entirely on its own site when the buyer purchases a gamepass.
// This only writes the 'pending' order/order_items rows (mirrors the
// DB-write half of create-checkout-session) and hands back each item's
// gamepass ID so the frontend can link straight to Roblox's purchase
// page. verify-robux-order (separate function) checks the buyer's
// Roblox inventory afterward and marks the order paid.
//
// Unlike Stripe checkout, signing in is REQUIRED here (not optional) -
// verifying a Robux purchase means checking a specific Roblox account's
// inventory, so we have to know who the buyer is and that they've
// linked a Roblox account, before an order can even be created.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { priceRobuxItems } from "../_shared/roblox.ts";
import { leasePassForOrder } from "../_shared/roblox_pool.ts";
import { resolveCampaignCode } from "../_shared/campaign.ts";
import { priceItems, resolveCoupon } from "../_shared/coupon.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in to pay with Robux." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: robloxAcct } = await admin
      .from("roblox_accounts")
      .select("roblox_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!robloxAcct) {
      return json({ ok: false, error: "Link your Roblox account first.", code: "NOT_LINKED" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const priced = await priceRobuxItems(admin, items);
    if (!priced.ok) return json({ ok: false, error: priced.error }, 400);
    const { lines, totalRobux } = priced;
    if (totalRobux <= 0) return json({ ok: false, error: "Order total must be greater than zero." }, 400);

    const subtotalUsd = lines.reduce((sum, li) => sum + li.unitPriceUsd * li.qty, 0);

    // Coupons are validated in USD (resolveCoupon needs platform/category
    // scope data priceRobuxItems' lines don't carry) via the exact same
    // shared logic every other checkout path trusts, then the resulting
    // discount is applied to the Robux total as the same PROPORTION of
    // the USD subtotal it discounts - not a flat USD->Robux conversion,
    // since each product's real robux_price is independently admin-set
    // and often has no fixed ratio to its USD price (see the checkout
    // page's own display-side fix for the identical reasoning). This is
    // what actually makes the gamepass price reflect the order total -
    // current prices/sales already did, via priceRobuxItems reading
    // products fresh on every call, but a coupon was never applied here
    // at all before this.
    let discountUsd = 0;
    let appliedCouponCode: string | null = null;
    let finalTotalRobux = totalRobux;
    let finalTotalUsd = subtotalUsd;
    if (body.couponCode) {
      const usdPriced = await priceItems(admin, items);
      if (usdPriced.ok) {
        const couponResult = await resolveCoupon(admin, String(body.couponCode), usdPriced.lines);
        // Same as create-checkout-session: a coupon that no longer
        // resolves (expired/deactivated/limit hit since the buyer applied
        // it) just quietly doesn't apply rather than blocking checkout.
        if (couponResult.ok && usdPriced.subtotal > 0) {
          discountUsd = couponResult.discount;
          appliedCouponCode = couponResult.code;
          const fractionOff = discountUsd / usdPriced.subtotal;
          finalTotalRobux = Math.round(totalRobux * (1 - fractionOff));
          finalTotalUsd = Math.max(0, Math.round((subtotalUsd - discountUsd) * 100) / 100);
        }
      }
    }

    const campaignCode = await resolveCampaignCode(admin, body.campaignCode);

    // Gifting: same server-side re-verification as the other three checkout
    // functions - never trust the recipient id the client got from
    // lookup-gift-recipient without a fresh existence check here. The
    // BUYER's own linked Roblox account (roblox_buyer_id above) is
    // completely unaffected by this - they're still who actually pays on
    // Roblox's side regardless of who the order is gifted to.
    let giftRecipientId: string | null = null;
    if (body.giftRecipientUserId) {
      const recipientId = String(body.giftRecipientUserId);
      if (recipientId === userData.user.id) return json({ ok: false, error: "You can't gift an order to yourself." }, 400);
      const { data: recipientProfile } = await admin.from("profiles").select("id").eq("id", recipientId).maybeSingle();
      if (!recipientProfile) return json({ ok: false, error: "Gift recipient not found." }, 400);
      giftRecipientId = recipientId;
    }

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: giftRecipientId || userData.user.id,
        purchased_by_user_id: giftRecipientId ? userData.user.id : null,
        status: "pending",
        currency: "robux",
        subtotal_usd: subtotalUsd,
        discount_usd: discountUsd,
        total_usd: finalTotalUsd,
        total_robux: finalTotalRobux,
        coupon_code: appliedCouponCode,
        roblox_buyer_id: robloxAcct.roblox_id,
        campaign_code: campaignCode,
      })
      .select()
      .single();
    if (orderErr || !order) return json({ ok: false, error: "Could not create order." }, 500);

    const { error: itemsErr } = await admin.from("order_items").insert(
      lines.map((li) => ({
        order_id: order.id,
        product_id: li.productId,
        product_slug: li.slug,
        title: li.title,
        licence: "standard",
        unit_price_usd: li.unitPriceUsd,
        qty: li.qty,
      })),
    );
    if (itemsErr) {
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: "Could not create order items." }, 500);
    }

    // One pass for the whole order, priced to the exact (post-discount)
    // total - not one pass per product. The buyer makes a single Roblox
    // purchase regardless of how many items are in the cart.
    const leased = await leasePassForOrder(admin, order.id, finalTotalRobux, robloxAcct.roblox_id);
    if (!leased.ok) {
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: leased.error, code: leased.code }, 503);
    }

    await admin.from("orders")
      .update({ roblox_gamepass_id: leased.pass.gamepassId })
      .eq("id", order.id);

    return json({
      ok: true,
      orderId: order.id,
      totalRobux: finalTotalRobux,
      // The single pass to buy. priceRobux is what we actually set on Roblox,
      // which verification checks against - it is not merely the display total.
      gamePassId: leased.pass.gamepassId,
      priceRobux: leased.pass.priceRobux,
      // Held so the buyer knows the window; the pass returns to the pool after
      // this and the order has to be restarted.
      expiresInSeconds: 900,
      items: lines.map((li) => ({
        slug: li.slug,
        title: li.title,
        qty: li.qty,
        unitRobux: li.unitRobux,
      })),
    });
  } catch (err) {
    console.error("[create-robux-order] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
