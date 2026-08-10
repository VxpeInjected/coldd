// supabase/functions/get-download-url/index.ts
//
// Deploy with:
//   supabase functions deploy get-download-url
//
// No new secrets required - reuses the auto-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY, plus SUPABASE_ANON_KEY (already set for
// email-otp/create-checkout-session).
//
// This is the actual enforcement point for "you must have paid to
// download": the product-files Storage bucket is private with no public
// policies, so this signed URL is the only way a file ever leaves it.
//
// Guest checkout support: a guest has no session, so ownership can't be
// proven via auth.uid(). If the caller passes the Stripe checkout session id
// instead (which success.html has, from the success_url redirect), that's
// accepted as equivalent proof - same trust model as get-order-by-session.
// A signed-in caller can still omit it and use their normal owned-orders
// lookup (e.g. redownloading later from the dashboard).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { downloadName, publicSignedUrl } from "../_shared/download.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const SIGNED_URL_TTL_SECONDS = 120;

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

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "");
    const sessionId = String(body.sessionId || "");
    if (!slug) return json({ ok: false, error: "Missing product." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    let owned = false;
    if (sessionId) {
      // Guest (or just-paid) path: the Stripe checkout session id is the proof.
      const { data: order, error: orderErr } = await admin
        .from("orders")
        .select("status, order_items(product_slug)")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();
      if (orderErr) return json({ ok: false, error: "Could not verify ownership." }, 500);
      owned = !!order && order.status === "paid" &&
        (order.order_items || []).some((i: { product_slug: string }) => i.product_slug === slug);
    } else {
      if (!authHeader) return json({ ok: false, error: "Please sign in." }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

      // Ownership check: does this user have a PAID order containing this slug?
      const { data: rows, error: ownedErr } = await admin
        .from("order_items")
        .select("id, orders!inner(user_id, status)")
        .eq("product_slug", slug)
        .eq("orders.user_id", userData.user.id)
        .eq("orders.status", "paid")
        .limit(1);
      if (ownedErr) return json({ ok: false, error: "Could not verify ownership." }, 500);
      owned = !!rows && rows.length > 0;
    }
    if (!owned) return json({ ok: false, error: "You don't own this product." }, 403);

    const { data: product, error: productErr } = await admin
      .from("products")
      .select("storage_path, title")
      .eq("slug", slug)
      .single();
    if (productErr || !product) return json({ ok: false, error: "Product not found." }, 404);

    const { data: signed, error: signErr } = await admin.storage
      .from("product-files")
      .createSignedUrl(product.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: downloadName(product.storage_path, product.title),
      });
    if (signErr || !signed) return json({ ok: false, error: "Could not generate download link." }, 500);

    return json({ ok: true, url: publicSignedUrl(signed.signedUrl) });
  } catch (err) {
    console.error("[get-download-url] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
