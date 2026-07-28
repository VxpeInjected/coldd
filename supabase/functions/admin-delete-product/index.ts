// supabase/functions/admin-delete-product/index.ts
//
// Deploy with:
//   supabase functions deploy admin-delete-product
//
// Same auth/secrets pattern as admin-upsert-product. Always soft-deletes
// (sets is_active = false) rather than removing the row outright: order_items
// references products.id with no cascade, so a hard delete on a product
// that's ever been purchased would either fail or orphan order history.
// Deactivated products just stop showing up in the public catalog query
// (products_select_active requires is_active = true).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { updateGamepass } from "../_shared/roblox.ts";

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

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return json({ ok: false, error: "Missing product id." }, 400);

    const { data: product } = await admin
      .from("products")
      .select("roblox_gamepass_id, roblox_universe_id")
      .eq("id", id)
      .maybeSingle();

    const { error: updateErr } = await admin.from("products").update({ is_active: false }).eq("id", id);
    if (updateErr) return json({ ok: false, error: "Could not remove product." }, 500);

    // Roblox has no delete endpoint for gamepasses - the closest
    // equivalent to soft-deleting the product is taking it off sale.
    // Best-effort: the product is already removed either way.
    if (product?.roblox_gamepass_id && product.roblox_universe_id) {
      updateGamepass(product.roblox_universe_id, product.roblox_gamepass_id, { isForSale: false }).catch((err) => {
        console.warn("[admin-delete-product] could not disable gamepass:", err);
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-delete-product] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
