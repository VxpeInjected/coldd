// supabase/functions/admin-resellers/index.ts
//
// Deploy with:
//   supabase functions deploy admin-resellers
//
// Same auth/is_admin gate as the other admin-* functions. Manages the
// resellers table (see supabase/resellers.sql): rows created automatically
// by the post-purchase popup (submit-reseller-info) show up here read-only
// on their onboarding answers, plus manual onboarding for resellers who
// bought before this system existed.
//
// Body: { action: "list" }
//       { action: "create", contactType, contactValue, sellingLocations: [{platform,url}],
//                 displayName?, productId?, status?, sellingNotes? }
//       { action: "update", id, patch: { contactType?, contactValue?, sellingLocations?,
//                 status?, sellingNotes?, displayName?, productId? } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Loc = { platform: string; url: string };
function cleanLocations(raw: unknown): Loc[] {
  return (Array.isArray(raw) ? raw : [])
    .map((l: { platform?: unknown; url?: unknown }) => ({
      platform: String(l && l.platform || "").trim().slice(0, 120),
      url: String(l && l.url || "").trim().slice(0, 500),
    }))
    .filter((l: Loc) => l.platform && l.url);
}
function locSummary(locs: Loc[]): string {
  return locs.map((l) => `${l.platform}: ${l.url}`).join("  •  ").slice(0, 500);
}

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
    const action = String(body.action || "");

    if (action === "list") {
      const { data, error } = await admin
        .from("resellers")
        .select("id, user_id, email, display_name, contact_type, contact_value, selling_locations, selling_where, selling_notes, status, source, created_at, products(title, slug), profiles(username, email)")
        .order("created_at", { ascending: false });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, resellers: data });
    }

    if (action === "create") {
      const contactType = body.contactType === "discord" ? "discord" : "email";
      const contactValue = String(body.contactValue || "").trim().slice(0, 200);
      const locations = cleanLocations(body.sellingLocations);
      if (!contactValue) return json({ ok: false, error: "A contact email or Discord is required." }, 400);
      if (contactType === "email" && !EMAIL_RE.test(contactValue)) return json({ ok: false, error: "Enter a valid contact email." }, 400);
      if (!locations.length) return json({ ok: false, error: "Add at least one place they're selling, with a link." }, 400);

      // Link to an existing account when the contact email matches one, so
      // the row shows the account and stays in sync with that user's own
      // seller profile.
      let userId: string | null = null;
      if (contactType === "email") {
        const { data: prof } = await admin.from("profiles").select("id").ilike("email", contactValue).maybeSingle();
        userId = prof?.id ?? null;
      }

      const { data, error } = await admin.from("resellers").insert({
        user_id: userId,
        email: contactType === "email" ? contactValue : null,
        contact_type: contactType,
        contact_value: contactValue,
        selling_locations: locations,
        selling_where: locSummary(locations),
        display_name: body.displayName ? String(body.displayName).trim().slice(0, 200) : null,
        product_id: body.productId || null,
        status: body.status === "inactive" ? "inactive" : "active",
        selling_notes: body.sellingNotes ? String(body.sellingNotes).trim().slice(0, 2000) : null,
        source: "manual",
      }).select("id, user_id, email, display_name, contact_type, contact_value, selling_locations, selling_where, selling_notes, status, source, created_at, products(title, slug), profiles(username, email)").single();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, reseller: data });
    }

    if (action === "update") {
      const id = String(body.id || "");
      if (!id) return json({ ok: false, error: "Missing id." }, 400);
      const patchIn = body.patch || {};
      const patch: Record<string, unknown> = {};
      if (patchIn.status === "active" || patchIn.status === "inactive") patch.status = patchIn.status;
      if (typeof patchIn.sellingNotes === "string") patch.selling_notes = patchIn.sellingNotes.trim().slice(0, 2000) || null;
      if (typeof patchIn.displayName === "string") patch.display_name = patchIn.displayName.trim().slice(0, 200) || null;
      if (typeof patchIn.productId === "string") patch.product_id = patchIn.productId || null;
      if (patchIn.contactType === "email" || patchIn.contactType === "discord") {
        patch.contact_type = patchIn.contactType;
        if (typeof patchIn.contactValue === "string") {
          const cv = patchIn.contactValue.trim().slice(0, 200);
          patch.contact_value = cv;
          patch.email = patchIn.contactType === "email" ? cv : null;
        }
      } else if (typeof patchIn.contactValue === "string") {
        patch.contact_value = patchIn.contactValue.trim().slice(0, 200);
      }
      if (Array.isArray(patchIn.sellingLocations)) {
        const locs = cleanLocations(patchIn.sellingLocations);
        patch.selling_locations = locs;
        patch.selling_where = locSummary(locs);
      }
      if (!Object.keys(patch).length) return json({ ok: false, error: "Nothing to update." }, 400);

      const { error } = await admin.from("resellers").update(patch).eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[admin-resellers] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
