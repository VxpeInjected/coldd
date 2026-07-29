// supabase/functions/get-order-by-session/index.ts
//
// Deploy with:
//   supabase functions deploy get-order-by-session
//
// (Regular deploy is fine - called via coldSupabase.functions.invoke(...) like
// every other function here, which always sends the anon key as a valid JWT
// even for a signed-out caller, so the platform's gateway-level JWT check
// still passes. No --no-verify-jwt needed, unlike stripe-webhook which is
// called directly by Stripe with no Supabase JWT at all.)
//
// Backs success.html's post-payment polling. Deliberately checks no user
// identity in the function body - it looks an order up purely by its Stripe
// Checkout session id, which
// is a long, cryptographically random token only Stripe ever hands to the
// person who completed that specific checkout (via the success_url redirect).
// This is what makes guest checkout work: a guest has no auth.uid() for RLS to
// match against, so this is the only way for them (or a signed-in buyer, same
// code path either way) to see their own order status/items right after
// paying, without requiring an account.
//
// Also accepts orderId (Robux orders have no Stripe session at all, since
// Roblox is the one handling payment) - a v4 UUID is just as unguessable
// as the Stripe session token, so the same no-auth-check trust model
// applies: possession of the id is the capability.
//
// Returns only status + line items - no email, no payment details, nothing
// beyond what success.html already needs to render.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "");
    const orderId = String(body.orderId || "");
    if (!sessionId && !orderId) return json({ ok: false, error: "Missing session id." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const query = admin.from("orders").select("id, status, order_items(product_slug, title, qty, licence)");
    const { data: order, error } = await (orderId ? query.eq("id", orderId) : query.eq("stripe_checkout_session_id", sessionId)).maybeSingle();
    if (error) return json({ ok: false, error: "Could not look up order." }, 500);
    if (!order) return json({ ok: false, error: "Order not found." }, 404);

    return json({ ok: true, status: order.status, items: order.order_items || [] });
  } catch (err) {
    console.error("[get-order-by-session] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
