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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://vxpeinjected.github.io";
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "");
    if (!slug) return json({ ok: false, error: "Missing product." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Ownership check: does this user have a PAID order containing this slug?
    const { data: owned, error: ownedErr } = await admin
      .from("order_items")
      .select("id, orders!inner(user_id, status)")
      .eq("product_slug", slug)
      .eq("orders.user_id", userData.user.id)
      .eq("orders.status", "paid")
      .limit(1);
    if (ownedErr) return json({ ok: false, error: "Could not verify ownership." }, 500);
    if (!owned || owned.length === 0) return json({ ok: false, error: "You don't own this product." }, 403);

    const { data: product, error: productErr } = await admin
      .from("products")
      .select("storage_path")
      .eq("slug", slug)
      .single();
    if (productErr || !product) return json({ ok: false, error: "Product not found." }, 404);

    const { data: signed, error: signErr } = await admin.storage
      .from("product-files")
      .createSignedUrl(product.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed) return json({ ok: false, error: "Could not generate download link." }, 500);

    return json({ ok: true, url: signed.signedUrl });
  } catch (err) {
    console.error("[get-download-url] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
