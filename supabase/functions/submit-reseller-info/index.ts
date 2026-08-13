// supabase/functions/submit-reseller-info/index.ts
//
// Deploy with:
//   supabase functions deploy submit-reseller-info
//
// Backs the post-purchase "where are you selling these?" popup on
// success.html. Same no-auth-check trust model as get-order-by-session:
// looked up purely by the order's Stripe session id (or orderId for Robux
// orders) - a guest checkout has no auth.uid() for RLS to match, so
// possession of that unguessable id is what proves this is the buyer's own
// order, exactly like it already does for viewing download status.
//
// One reseller row is created per resell-licence line item on the order
// (upserted on order_item_id, so a resubmitted popup - e.g. a second tab -
// updates the same row instead of duplicating it).
//
// Body: { sessionId?, orderId?, email, sellingWhere, sellingNotes? }

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
    const email = String(body.email || "").trim().slice(0, 200);
    const sellingWhere = String(body.sellingWhere || "").trim().slice(0, 500);
    const sellingNotes = body.sellingNotes ? String(body.sellingNotes).trim().slice(0, 2000) : null;
    if (!sessionId && !orderId) return json({ ok: false, error: "Missing order reference." }, 400);
    if (!email || !sellingWhere) return json({ ok: false, error: "Email and where you're selling are required." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const query = admin.from("orders").select("id, user_id, status, order_items(id, product_id, licence)");
    const { data: order, error: orderErr } = await (orderId ? query.eq("id", orderId) : query.eq("stripe_checkout_session_id", sessionId)).maybeSingle();
    if (orderErr) return json({ ok: false, error: "Could not look up order." }, 500);
    if (!order || order.status !== "paid") return json({ ok: false, error: "Order not found." }, 404);

    const resellItems = (order.order_items || []).filter((it: { licence: string }) => it.licence === "resell");
    if (!resellItems.length) return json({ ok: false, error: "No resell licences on this order." }, 400);

    const rows = resellItems.map((it: { id: string; product_id: string }) => ({
      user_id: order.user_id,
      order_id: order.id,
      order_item_id: it.id,
      product_id: it.product_id,
      email,
      selling_where: sellingWhere,
      selling_notes: sellingNotes,
      source: "purchase",
    }));

    const { error: upsertErr } = await admin.from("resellers").upsert(rows, { onConflict: "order_item_id" });
    if (upsertErr) return json({ ok: false, error: "Could not save your info." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[submit-reseller-info] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
