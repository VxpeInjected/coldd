// supabase/functions/submit-reseller-info/index.ts
//
// Deploy with:
//   supabase functions deploy submit-reseller-info
//
// Backs the required post-purchase "Provide seller information" popup on
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
// Body: { sessionId?, orderId?,
//         contactType: "email"|"discord", contactValue,
//         sellingLocations: [{ platform, url }, ...],
//         notes? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyOrderAccess } from "../_shared/order_access.ts";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "");
    const orderId = String(body.orderId || "");
    const token = String(body.token || "");
    if (!sessionId && !orderId) return json({ ok: false, error: "Missing order reference." }, 400);

    const contactType = body.contactType === "discord" ? "discord" : "email";
    const contactValue = String(body.contactValue || "").trim().slice(0, 200);
    if (!contactValue) return json({ ok: false, error: "A contact email or Discord is required." }, 400);
    if (contactType === "email" && !EMAIL_RE.test(contactValue)) {
      return json({ ok: false, error: "Enter a valid contact email." }, 400);
    }

    const rawLocations = Array.isArray(body.sellingLocations) ? body.sellingLocations : [];
    const locations = rawLocations
      .map((l: { platform?: unknown; url?: unknown }) => ({
        platform: String(l && l.platform || "").trim().slice(0, 120),
        url: String(l && l.url || "").trim().slice(0, 500),
      }))
      .filter((l: { platform: string; url: string }) => l.platform && l.url);
    if (!locations.length) {
      return json({ ok: false, error: "Add at least one place you'll be selling, with a link." }, 400);
    }

    const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;

    const admin = createClient(supabaseUrl, serviceKey);

    const query = admin.from("orders").select("id, user_id, purchased_by_user_id, status, paid_at, created_at, claim_token_hash, order_items(id, product_id, licence)");
    const { data: order, error: orderErr } = await (orderId ? query.eq("id", orderId) : query.eq("stripe_checkout_session_id", sessionId)).maybeSingle();
    if (orderErr) return json({ ok: false, error: "Could not look up order." }, 500);
    if (!order) return json({ ok: false, error: "Order not found." }, 404);

    // Account order -> must be signed in as the buyer. Guest order -> must
    // present the one-time ?t= claim token. (see _shared/order_access.ts)
    const getUserId = async (): Promise<string | null> => {
      if (!authHeader) return null;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data } = await userClient.auth.getUser();
      return data?.user?.id ?? null;
    };
    const verdict = await verifyOrderAccess(order, getUserId, token, { requirePaid: true });
    if (!verdict.ok) return json({ ok: false, code: verdict.code, error: verdict.error }, verdict.status);

    const resellItems = (order.order_items || []).filter((it: { licence: string }) => it.licence === "resell");
    if (!resellItems.length) return json({ ok: false, error: "No resell licences on this order." }, 400);

    // Human summary for the admin list's existing "selling_where" column.
    const summary = locations.map((l: { platform: string; url: string }) => `${l.platform}: ${l.url}`).join("  •  ").slice(0, 500);

    const rows = resellItems.map((it: { id: string; product_id: string }) => ({
      user_id: order.user_id,
      order_id: order.id,
      order_item_id: it.id,
      product_id: it.product_id,
      email: contactType === "email" ? contactValue : null,
      contact_type: contactType,
      contact_value: contactValue,
      selling_locations: locations,
      selling_where: summary,
      selling_notes: notes,
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
