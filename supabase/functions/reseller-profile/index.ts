// supabase/functions/reseller-profile/index.ts
//
// Deploy with:
//   supabase functions deploy reseller-profile
//
// Backs the "Seller profile" tab in account settings (dashboard). That tab
// is only shown to a buyer who holds at least one paid resell licence.
//
// Same seller-info shape as the post-purchase onboarding popup
// (submit-reseller-info): contact channel (email OR discord) + repeatable
// { platform, url } selling locations + free-text notes. One row per resell
// order_item in public.resellers; this function keeps them all in sync so
// the buyer has a single seller identity to edit.
//
// Body:
//   { action: "get" }
//     -> { ok, profile: { contactType, contactValue, sellingLocations, notes } | null,
//          licenses: [{ slug, title, orderId, createdAt }] }
//   { action: "update", contactType, contactValue, sellingLocations, notes? }
//     -> { ok }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

type ResellItem = { id: string; product_id: string; product_slug: string; title: string; orders: { id: string; created_at: string } };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);
    const uid = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Every paid resell order_item this user owns - the set of licences the
    // seller profile covers.
    const { data: itemRows } = await admin
      .from("order_items")
      .select("id, product_id, product_slug, title, orders!inner(id, created_at, user_id, status)")
      .eq("licence", "resell")
      .eq("orders.user_id", uid)
      .eq("orders.status", "paid");
    const items = (itemRows || []) as unknown as ResellItem[];
    if (!items.length) return json({ ok: false, error: "You don't hold a resell licence." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "get");

    if (action === "get") {
      const { data: rows } = await admin
        .from("resellers")
        .select("contact_type, contact_value, selling_locations, selling_notes, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);
      const r = (rows || [])[0];
      const profile = r
        ? {
          contactType: r.contact_type === "discord" ? "discord" : "email",
          contactValue: r.contact_value || "",
          sellingLocations: Array.isArray(r.selling_locations) ? r.selling_locations : [],
          notes: r.selling_notes || "",
        }
        : null;
      const licenses = items
        .map((it) => ({ slug: it.product_slug, title: it.title, orderId: it.orders?.id, createdAt: it.orders?.created_at }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ ok: true, profile, licenses });
    }

    if (action === "update") {
      const contactType = body.contactType === "discord" ? "discord" : "email";
      const contactValue = String(body.contactValue || "").trim().slice(0, 200);
      if (!contactValue) return json({ ok: false, error: "A contact email or Discord is required." }, 400);
      if (contactType === "email" && !EMAIL_RE.test(contactValue)) {
        return json({ ok: false, error: "Enter a valid contact email." }, 400);
      }
      const locations = (Array.isArray(body.sellingLocations) ? body.sellingLocations : [])
        .map((l: { platform?: unknown; url?: unknown }) => ({
          platform: String(l && l.platform || "").trim().slice(0, 120),
          url: String(l && l.url || "").trim().slice(0, 500),
        }))
        .filter((l: { platform: string; url: string }) => l.platform && l.url);
      if (!locations.length) {
        return json({ ok: false, error: "Add at least one place you'll be selling, with a link." }, 400);
      }
      const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;
      const summary = locations.map((l: { platform: string; url: string }) => `${l.platform}: ${l.url}`).join("  •  ").slice(0, 500);

      const rows = items.map((it) => ({
        user_id: uid,
        order_id: it.orders?.id,
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
      const { error: upErr } = await admin.from("resellers").upsert(rows, { onConflict: "order_item_id" });
      if (upErr) return json({ ok: false, error: "Could not save your seller profile." }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[reseller-profile] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
