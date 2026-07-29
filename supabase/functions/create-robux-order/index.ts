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
    const priced = await priceRobuxItems(admin, Array.isArray(body.items) ? body.items : []);
    if (!priced.ok) return json({ ok: false, error: priced.error }, 400);
    const { lines, totalRobux } = priced;
    if (totalRobux <= 0) return json({ ok: false, error: "Order total must be greater than zero." }, 400);

    const subtotalUsd = lines.reduce((sum, li) => sum + li.unitPriceUsd * li.qty, 0);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: userData.user.id,
        status: "pending",
        currency: "robux",
        subtotal_usd: subtotalUsd,
        discount_usd: 0,
        total_usd: subtotalUsd,
        total_robux: totalRobux,
        roblox_buyer_id: robloxAcct.roblox_id,
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

    return json({
      ok: true,
      orderId: order.id,
      totalRobux,
      items: lines.map((li) => ({
        slug: li.slug,
        title: li.title,
        qty: li.qty,
        unitRobux: li.unitRobux,
        gamePassId: li.gamePassId,
      })),
    });
  } catch (err) {
    console.error("[create-robux-order] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
