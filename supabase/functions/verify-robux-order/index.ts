// supabase/functions/verify-robux-order/index.ts
//
// Deploy with:
//   supabase functions deploy verify-robux-order
//
// Called after the buyer says they've bought each gamepass on Roblox.
// Primary check: the buyer's own Roblox inventory (via their linked
// OAuth token, user.inventory-item:read scope) - this is the
// Open-Cloud-documented, officially-supported way to confirm ownership.
// Fallback (only if ROBLOX_FALLBACK_COOKIE is configured - see
// _shared/roblox.ts): scan the group's recent sale transactions for any
// gamepass the inventory check missed. If neither confirms a given
// gamepass, the order stays 'pending' - it's still visible in the admin
// Orders panel for a manual "Mark completed" override
// (admin-manage-order, already built), so nothing is ever silently lost,
// it just needs a human to look.
//
// Body: { orderId }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkGroupTransactionForSale, findOwnedGamePasses, getValidRobloxToken, robloxFallbackConfigured } from "../_shared/roblox.ts";

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

    const { data: order, error: orderErr } = await admin.from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) return json({ ok: false, error: "Order not found." }, 404);
    if (order.user_id !== userData.user.id) return json({ ok: false, error: "This isn't your order." }, 403);
    if (order.currency !== "robux") return json({ ok: false, error: "Not a Robux order." }, 400);

    if (order.status === "paid") return json({ ok: true, verified: true, status: "paid" });
    if (order.status !== "pending") return json({ ok: false, error: `Order is ${order.status}, not pending.` }, 400);

    const { data: items, error: itemsErr } = await admin
      .from("order_items")
      .select("product_id, title, qty")
      .eq("order_id", orderId);
    if (itemsErr || !items?.length) return json({ ok: false, error: "Could not load order items." }, 500);

    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, title, roblox_gamepass_id")
      .in("id", items.map((i: { product_id: string }) => i.product_id));
    if (prodErr || !products) return json({ ok: false, error: "Could not load products." }, 500);

    // deno-lint-ignore no-explicit-any
    const gamePassByProduct = new Map(products.map((p: any) => [p.id, { gamePassId: p.roblox_gamepass_id as string, title: p.title as string }]));
    // deno-lint-ignore no-explicit-any
    const targets = items
      .map((i: any) => gamePassByProduct.get(i.product_id))
      .filter((t: any): t is { gamePassId: string; title: string } => !!t && !!t.gamePassId);
    if (!targets.length) return json({ ok: false, error: "This order has no linked gamepasses to verify." }, 500);
    const gamePassIds = targets.map((t) => t.gamePassId);

    const tokenSet = await getValidRobloxToken(admin, userData.user.id);
    if (!tokenSet) {
      return json({ ok: false, error: "Your Roblox link has expired - please re-link your account and try again.", code: "RELINK_NEEDED" }, 400);
    }

    const owned = await findOwnedGamePasses(tokenSet.accessToken, tokenSet.robloxId, gamePassIds);
    let missing = gamePassIds.filter((id) => !owned.has(id));

    if (missing.length && robloxFallbackConfigured()) {
      const buyerId = order.roblox_buyer_id || tokenSet.robloxId;
      const stillMissing: string[] = [];
      for (const id of missing) {
        const foundInGroup = await checkGroupTransactionForSale(id, buyerId);
        if (!foundInGroup) stillMissing.push(id);
      }
      missing = stillMissing;
    }

    if (missing.length === 0) {
      const method = owned.size === gamePassIds.length ? "inventory" : "group_transaction";
      await admin
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString(), roblox_verification_method: method })
        .eq("id", orderId);
      return json({ ok: true, verified: true, status: "paid" });
    }

    const missingTitles = targets.filter((t) => missing.includes(t.gamePassId)).map((t) => t.title);
    return json({
      ok: true,
      verified: false,
      status: "pending",
      missing: missingTitles,
      message: "Could not confirm: " + missingTitles.join(", ") + ". Roblox purchases can take a few minutes to show up - try again shortly.",
    });
  } catch (err) {
    console.error("[verify-robux-order] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
