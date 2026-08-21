// supabase/functions/create-checkout-session/index.ts
//
// Deploy with:
//   supabase functions deploy create-checkout-session
//
// Required secrets (set once):
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set SITE_URL=https://coldd.dev
//
// IMPORTANT: if SITE_URL was previously set to the old
// https://vxpeinjected.github.io/coldd value, it must be updated to the
// line above - the secret takes precedence over this file's ALLOWED_ORIGIN
// fallback, so leaving the old secret in place would keep sending Stripe's
// post-checkout redirect to a dead URL even after redeploying this function.
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are the same
// three env vars already relied on by supabase/functions/email-otp.
//
// Guest checkout: signing in is optional. If the caller has a real session
// the order is tied to their user_id (so it shows up in their dashboard and
// they can re-download later); if not, orders.user_id is left null and Stripe
// collects the buyer's email itself. Either way, get-order-by-session and
// get-download-url can look the order up by Stripe session id alone, so a
// guest can still see + download from success.html right after paying.
//
// Coupons: an optional couponCode is resolved with the exact same logic
// validate-coupon uses (via _shared/coupon.ts), so the discount shown on
// checkout.html before payment always matches what's actually charged here.
// The discount is applied as a one-time Stripe coupon for the exact computed
// amount (rather than a percentage-off on the whole Stripe session), since
// our coupons can be scoped to only some of the cart's line items.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { priceItems, resolveCoupon, spendTierDiscount, clampCombinedDiscount } from "../_shared/coupon.ts";
import { resolveCampaignCode } from "../_shared/campaign.ts";
import { isSiteInMaintenance } from "../_shared/maintenance.ts";

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
    const siteUrl = Deno.env.get("SITE_URL") ?? ALLOWED_ORIGIN;

    // Identify the caller from their own JWT if they're signed in - but signing
    // in is optional. A guest (no/invalid Authorization header) checks out with
    // orders.user_id left null; Stripe's own hosted page collects their email.
    let user: { id: string; email?: string | null } | null = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) user = userData.user;
    }

    const body = await req.json().catch(() => ({}));
    const admin = createClient(supabaseUrl, serviceKey);

    // The maintenance overlay (site-gate.js) is a client-side visual gate
    // only - removing it in DevTools, or just calling this function
    // directly with no browser involved at all, always sailed straight
    // through to a real checkout regardless of site mode. This is the
    // actual enforcement point. Staff stay exempt, same as the overlay's
    // own admin-bypass behavior (site-gate.js's showWhitelistBanner path).
    if (await isSiteInMaintenance(admin)) {
      let isStaff = false;
      if (user) {
        const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
        isStaff = !!profile?.is_admin;
      }
      if (!isStaff) return json({ ok: false, error: "coldd is temporarily down for maintenance. Please check back shortly." }, 503);
    }

    const priced = await priceItems(admin, Array.isArray(body.items) ? body.items : [], { bundleToken: body.bundleToken ? String(body.bundleToken) : undefined });
    if (!priced.ok) return json({ ok: false, error: priced.error }, 400);
    const { lines, subtotal } = priced;
    if (subtotal <= 0) return json({ ok: false, error: "Order total must be greater than zero." }, 400);

    let discount = 0;
    let appliedCouponCode: string | null = null;
    if (body.couponCode) {
      const couponResult = await resolveCoupon(admin, String(body.couponCode), lines);
      // A coupon that no longer resolves (expired/deactivated/limit hit
      // between validate-coupon and now) just quietly doesn't apply rather
      // than blocking checkout - the shopper already saw the discount
      // applied on the page, so failing the whole order here would be a
      // worse experience than a same-price checkout.
      if (couponResult.ok) {
        discount = couponResult.discount;
        appliedCouponCode = couponResult.code;
      }
    }
    // "Email me deals" no longer carries a discount itself - that
    // incentive moved to the site-wide popup (which mints a real one-time
    // coupon instead), so this box is consent-only again. The flag is
    // still recorded on the order for the completion-time marketing_optins
    // upsert.
    const marketingOptIn = !!body.marketingOptIn;
    // Automatic "spend $X, get Y% off" - no code, applies off the real
    // subtotal, stacks with a coupon the same floor-safe way the old
    // marketing discount did.
    discount = clampCombinedDiscount(lines, discount + spendTierDiscount(lines).discount);
    const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const campaignCode = await resolveCampaignCode(admin, body.campaignCode);

    // Gifting: buyer must be signed in (a guest has no id to record as the
    // payer), and the recipient is re-verified server-side rather than
    // trusted from the client, same defense-in-depth as every other
    // payment/admin function here that never trusts a client-supplied id.
    let giftRecipientId: string | null = null;
    if (user && body.giftRecipientUserId) {
      const recipientId = String(body.giftRecipientUserId);
      if (recipientId === user.id) return json({ ok: false, error: "You can't gift an order to yourself." }, 400);
      const { data: recipientProfile } = await admin.from("profiles").select("id").eq("id", recipientId).maybeSingle();
      if (!recipientProfile) return json({ ok: false, error: "Gift recipient not found." }, 400);
      giftRecipientId = recipientId;
    }

    // Create the order + order_items as 'pending' before talking to Stripe,
    // so we have an order_id to hand to Stripe as metadata and correlate on
    // the webhook / success page.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: giftRecipientId || (user ? user.id : null),
        purchased_by_user_id: giftRecipientId ? user!.id : null,
        status: "pending",
        subtotal_usd: subtotal,
        discount_usd: discount,
        total_usd: total,
        coupon_code: appliedCouponCode,
        campaign_code: campaignCode,
        marketing_opt_in: marketingOptIn,
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
        licence: li.licence,
        unit_price_usd: li.unitPrice,
        qty: li.qty,
      })),
    );
    if (itemsErr) {
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: "Could not create order items." }, 500);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2024-06-20",
    });

    try {
      let discounts: { coupon: string }[] | undefined;
      if (discount > 0) {
        const stripeCoupon = await stripe.coupons.create({
          amount_off: Math.round(discount * 100),
          currency: "usd",
          duration: "once",
          name: appliedCouponCode ?? undefined,
        });
        discounts = [{ coupon: stripeCoupon.id }];
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(user?.email ? { customer_email: user.email } : {}),
        ...(user ? { client_reference_id: user.id } : {}),
        line_items: lines.map((li) => ({
          price_data: {
            currency: "usd",
            unit_amount: Math.round(li.unitPrice * 100),
            product_data: { name: li.title },
          },
          quantity: li.qty,
        })),
        ...(discounts ? { discounts } : {}),
        success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout`,
        metadata: { order_id: order.id },
      });

      await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);

      // usage_count is incremented by stripe-webhook once the order actually
      // pays, not here - incrementing at session-creation time would count
      // abandoned/expired/failed checkouts against the coupon's usage_limit.

      return json({ ok: true, url: session.url });
    } catch (stripeErr) {
      console.error("[create-checkout-session] stripe error:", stripeErr);
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: "Could not start checkout with Stripe." }, 500);
    }
  } catch (err) {
    console.error("[create-checkout-session] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
