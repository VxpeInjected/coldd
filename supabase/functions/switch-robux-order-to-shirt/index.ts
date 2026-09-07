// supabase/functions/switch-robux-order-to-shirt/index.ts
//
// Deploy with:
//   supabase functions deploy switch-robux-order-to-shirt
//
// The "Can't access the gamepass?" button on the Robux purchase modal.
// Gamepasses can't be bought by young accounts; this switches an existing
// pending Robux order off its leased pool gamepass and onto the group's one
// classic shirt instead, priced to the same total. verify-robux-order then
// confirms it the same way (group sale ledger), keyed on the shirt asset.
//
// There is only ONE shirt. If it's already leased to a different live order
// this returns { ready: false, code: "SHIRT_BUSY" } and leaves the order's
// gamepass lease untouched - the frontend shows "Loading" and retries.
//
// Body: { orderId }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getLeasedPass, releasePass } from "../_shared/roblox_pool.ts";
import { leaseShirtForOrder, getShirtLease } from "../_shared/roblox_shirt.ts";

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
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const orderId = String((await req.json().catch(() => ({}))).orderId || "");
    if (!orderId) return json({ ok: false, error: "Missing orderId." }, 400);

    const { data: order, error: orderErr } = await admin
      .from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) return json({ ok: false, error: "Order not found." }, 404);
    // Same ownership rule as verify-robux-order: buyer (or gift purchaser) only.
    if (order.user_id !== userData.user.id && order.purchased_by_user_id !== userData.user.id) {
      return json({ ok: false, error: "This isn't your order." }, 403);
    }
    if (order.currency !== "robux") return json({ ok: false, error: "Not a Robux order." }, 400);
    if (order.status === "paid") return json({ ok: true, ready: true, alreadyPaid: true });
    if (order.status !== "pending") {
      return json({ ok: false, error: `Order is ${order.status}, not pending.` }, 400);
    }

    // Idempotent: already switched to the shirt on an earlier click.
    const existing = await getShirtLease(admin, orderId);
    if (existing && existing.lease_price_robux) {
      return json({
        ok: true, ready: true,
        assetId: existing.asset_id,
        priceRobux: Number(existing.lease_price_robux),
      });
    }

    // The price to charge on the shirt is whatever was locked in for the
    // gamepass lease (falling back to the order total). Never recompute the
    // cart here - the order total is already final.
    const pass = await getLeasedPass(admin, orderId);
    const expectedRobux = Number(pass?.lease_price_robux ?? order.total_robux ?? 0);
    if (!(expectedRobux > 0)) {
      return json({ ok: false, error: "This order has no confirmed total to charge." }, 500);
    }

    // Lease the shirt FIRST. If it's busy, bail without disturbing the
    // gamepass lease - the buyer can still use the gamepass, or wait.
    const leased = await leaseShirtForOrder(admin, orderId, expectedRobux);
    if (!leased.ok) {
      // Both are soft "not ready, keep the gamepass" outcomes - 200 so the
      // frontend reads the code rather than treating it as a hard failure.
      return json({ ok: true, ready: false, code: leased.code, error: leased.error });
    }

    // Shirt is ours and priced. Hand the gamepass back to the pool and flip
    // the order onto the shirt path.
    if (pass) {
      await releasePass(admin, orderId, String(pass.universe_id), String(pass.gamepass_id));
    }
    await admin.from("orders")
      .update({ roblox_pay_method: "shirt", roblox_gamepass_id: null })
      .eq("id", orderId);

    return json({
      ok: true, ready: true,
      assetId: leased.assetId,
      priceRobux: leased.priceRobux,
      expiresInSeconds: 900,
    });
  } catch (err) {
    console.error("[switch-robux-order-to-shirt] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
