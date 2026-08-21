// supabase/functions/admin-grant-product/index.ts
//
// Deploy with:
//   supabase functions deploy admin-grant-product
//
// Same auth/is_admin gate as the other admin-* functions. Manually comps a
// product to a user - writes a real 'paid' order + order_item (total $0,
// source 'granted') so it shows up in the customer's dashboard/downloads
// and the admin orders panel exactly like a real purchase, instead of the
// previous client-only fake row that vanished on the next refresh.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyUser } from "../_shared/notify.ts";

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
    const targetUserId = String(body.userId || "");
    const productId = String(body.productId || "");
    const licence = body.licence === "resell" ? "resell" : "standard";
    if (!targetUserId || !productId) return json({ ok: false, error: "Missing userId or productId." }, 400);

    const { data: target, error: targetErr } = await admin.from("profiles").select("id").eq("id", targetUserId).single();
    if (targetErr || !target) return json({ ok: false, error: "User not found." }, 404);

    const { data: product, error: productErr } = await admin
      .from("products")
      .select("id, slug, title")
      .eq("id", productId)
      .single();
    if (productErr || !product) return json({ ok: false, error: "Product not found." }, 404);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: targetUserId,
        status: "paid",
        currency: "usd",
        subtotal_usd: 0,
        discount_usd: 0,
        total_usd: 0,
        source: "granted",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (orderErr || !order) return json({ ok: false, error: "Could not create order." }, 500);

    const { error: itemErr } = await admin.from("order_items").insert({
      order_id: order.id,
      product_id: product.id,
      product_slug: product.slug,
      title: product.title,
      licence,
      unit_price_usd: 0,
      qty: 1,
    });
    if (itemErr) {
      await admin.from("orders").delete().eq("id", order.id);
      return json({ ok: false, error: "Could not grant the product." }, 500);
    }

    notifyUser(admin, targetUserId, "You've been granted a product", product.title + " is now in your Licenses.", "/dashboard?panel=owned");

    return json({ ok: true, orderId: order.id });
  } catch (err) {
    console.error("[admin-grant-product] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
