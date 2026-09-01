// supabase/functions/admin-upsert-bundle/index.ts
//
// Deploy with:
//   supabase functions deploy admin-upsert-bundle
//
// Admin CRUD for curated (permanent, public) product bundles. Writes
// bundle_deals rows with source='curated' - see supabase/bundles.sql.
// A curated bundle gives bundle_pct off every listed product, but only
// when the whole set is in the cart (item_pct stays 0), which is exactly
// what priceItems() already does with the row's token.
//
// Body:
//   { action: "list" }
//   { action: "upsert", token?, slug, title, image?, productSlugs: [], discountPct, active? }
//   { action: "delete", token }

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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

function randToken(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += a[Math.floor(Math.random() * a.length)];
  return "BNDL-" + s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
    if (!profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") {
      const { data } = await admin.from("bundle_deals")
        .select("token, slug, title, image, slugs, bundle_pct, active, created_at")
        .eq("source", "curated").order("created_at", { ascending: false });
      return json({ ok: true, bundles: data ?? [] });
    }

    if (action === "delete") {
      const token = String(body.token || "");
      if (!token) return json({ ok: false, error: "Missing token." }, 400);
      await admin.from("bundle_deals").delete().eq("token", token).eq("source", "curated");
      return json({ ok: true });
    }

    if (action === "upsert") {
      const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      const title = String(body.title || "").trim();
      const image = String(body.image || "").trim() || null;
      const productSlugs = Array.isArray(body.productSlugs)
        ? Array.from(new Set(body.productSlugs.map((s: unknown) => String(s || "").trim()).filter(Boolean)))
        : [];
      const discountPct = Math.max(1, Math.min(90, Math.round(Number(body.discountPct) || 0)));
      const active = body.active !== false;

      if (!slug || !title) return json({ ok: false, error: "Slug and title are required." }, 400);
      if (productSlugs.length < 2) return json({ ok: false, error: "A bundle needs at least 2 products." }, 400);

      // Every product must exist and be active.
      const { data: found } = await admin.from("products").select("slug").in("slug", productSlugs).eq("is_active", true);
      const foundSet = new Set((found ?? []).map((p: { slug: string }) => p.slug));
      const missing = productSlugs.filter((s) => !foundSet.has(s));
      if (missing.length) return json({ ok: false, error: `Not active products: ${missing.join(", ")}` }, 400);

      const row = {
        slugs: productSlugs,
        item_pct: 0,
        bundle_pct: discountPct,
        source: "curated" as const,
        expires_at: null,
        user_id: null,
        email: null,
        title,
        image,
        slug,
        active,
      };

      const token = body.token ? String(body.token) : null;
      if (token) {
        const { error } = await admin.from("bundle_deals").update(row).eq("token", token).eq("source", "curated");
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, token });
      }
      // New: retry on the rare slug/token collision.
      for (let i = 0; i < 4; i++) {
        const t = randToken();
        const { error } = await admin.from("bundle_deals").insert({ ...row, token: t });
        if (!error) return json({ ok: true, token: t });
        if (/duplicate key/i.test(error.message) && /slug/i.test(error.message)) {
          return json({ ok: false, error: "A bundle with that slug already exists." }, 400);
        }
      }
      return json({ ok: false, error: "Could not create the bundle." }, 500);
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[admin-upsert-bundle] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
