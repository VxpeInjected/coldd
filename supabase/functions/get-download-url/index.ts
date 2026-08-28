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
// proven via auth.uid(). The success page identifies the just-completed
// order with whatever the payment provider handed back - a Stripe
// `session_id`, or an `order_id` for PayPal / crypto / Robux. Either one
// is accepted as proof of ownership, but:
//   - only for a genuinely guest order (orders.user_id null). An order
//     tied to an account always requires the caller to be signed in as
//     that account; the id in the URL is just a lookup key, never a
//     bearer token.
//   - only for GUEST_LINK_WINDOW_MS after payment. A success-page URL
//     gets forwarded, screenshotted, pasted in Discord "to prove a
//     purchase" and left in shared history - it was never meant to be a
//     permanent no-account download link. Past the window the guest makes
//     a free account with their checkout email (which the receipt and
//     success page both tell them to do) to keep downloading.
// A signed-in caller can omit both ids and use their normal owned-orders
// lookup (e.g. redownloading later from the dashboard).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { downloadName, publicSignedUrl } from "../_shared/download.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const SIGNED_URL_TTL_SECONDS = 120;

const GUEST_LINK_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    // v4 UUID only - a non-uuid orderId would throw a Postgres 22P02.
    const orderId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.orderId || ""))
      ? String(body.orderId)
      : "";
    if (!slug) return json({ ok: false, error: "Missing product." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    let owned = false;
    if (sessionId || orderId) {
      // Same capability model whether the success page identified the order
      // by Stripe session id (card) or order id (PayPal / crypto / Robux).
      const q = admin
        .from("orders")
        .select("status, user_id, paid_at, created_at, order_items(product_slug)");
      const { data: order, error: orderErr } = await (
        sessionId ? q.eq("stripe_checkout_session_id", sessionId) : q.eq("id", orderId)
      ).maybeSingle();
      if (orderErr) return json({ ok: false, error: "Could not verify ownership." }, 500);
      const matchesOrder = !!order && order.status === "paid" &&
        (order.order_items || []).some((i: { product_slug: string }) => i.product_slug === slug);

      if (order?.user_id) {
        // Account order (every Robux order, plus any signed-in card/PayPal
        // one). The id in the URL is only a lookup key - the caller has to
        // actually be signed in as the buyer, so forwarding the success
        // link gets the recipient nothing.
        if (!authHeader) return json({ ok: false, error: "Please sign in to download this." }, 401);
        const sessionUserClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: sessionUserData } = await sessionUserClient.auth.getUser();
        owned = matchesOrder && sessionUserData?.user?.id === order.user_id;
      } else {
        // Genuine guest order (guest card / PayPal / crypto) - the id is
        // the only possible proof, so it only counts for a short window
        // after payment. Past that, whoever holds the link (buyer
        // included) makes a free account with the order email.
        const paidTs = order ? Date.parse(order.paid_at || order.created_at || "") : NaN;
        const fresh = Number.isFinite(paidTs) && (Date.now() - paidTs) < GUEST_LINK_WINDOW_MS;
        if (matchesOrder && !fresh) {
          return json({
            ok: false,
            code: "LINK_EXPIRED",
            error: "This download link has expired. Create a free account with the email you used at checkout to download your purchases any time.",
          }, 403);
        }
        owned = matchesOrder && fresh;
      }
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

    return json({ ok: true, url: publicSignedUrl(signed.signedUrl), filename: downloadName(product.storage_path, product.title) });
  } catch (err) {
    console.error("[get-download-url] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
