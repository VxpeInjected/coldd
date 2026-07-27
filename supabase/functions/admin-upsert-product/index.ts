// supabase/functions/admin-upsert-product/index.ts
//
// Deploy with:
//   supabase functions deploy admin-upsert-product
//
// No new secrets required - reuses the auto-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.
//
// Backend for the admin panel's product create/edit form (admin.html +
// admin.js). Creates or updates a row in public.products plus its matching
// public.product_legal row. Gated on profiles.is_admin - this is the real,
// server-side enforcement that the client-side Discord-ID whitelist in
// supabase-init.js can't provide on its own.
//
// NOT wired up to admin.js yet: the admin panel is still a localStorage
// mock until Supabase is actually connected. This function is ready for
// that wiring once the tables above are created and the site's
// coldSupabase client starts calling it via functions.invoke(...).

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

function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(admin: ReturnType<typeof createClient>, base: string, excludeId?: string) {
  let slug = base || "product";
  let n = 2;
  for (;;) {
    let q = admin.from("products").select("id").eq("slug", slug).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (!data || data.length === 0) return slug;
    slug = `${base}-${n++}`;
  }
}

type LegalPayload = {
  tos?: string;
  proofFiles?: string[];
  devProofFiles?: string[];
  contacts?: { label: string; value: string }[];
  licenseCost?: number;
  licenseCostCurrency?: "usd" | "robux";
  licensePurchasedAt?: string | null;
  minSaleUsd?: number;
  minSaleRobux?: number;
  canBeFree?: boolean;
  disallowSales?: boolean;
};

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
    const id: string | undefined = body.id || undefined;
    const title = String(body.title || "").trim();
    if (!title) return json({ ok: false, error: "Title is required." }, 400);

    const platform = body.platform === "Minecraft" ? "Minecraft" : "Roblox";
    const price = Math.max(0, Number(body.price) || 0);

    const productFields: Record<string, unknown> = {
      title,
      platform,
      page: platform === "Minecraft" ? "minecraft.html" : "assets.html",
      price_usd: price,
      cat: body.cat != null ? String(body.cat) : null,
      subcat: body.subcat != null ? String(body.subcat) : null,
      description: body.desc != null ? String(body.desc) : "",
      long_description: body.longDesc != null ? String(body.longDesc) : "",
      image: body.image != null ? String(body.image) : null,
      gallery: Array.isArray(body.gallery) ? body.gallery : [],
      video: body.video != null ? String(body.video) : null,
      resell_available: !!body.resell,
      resell_price_usd: body.resell && body.resellPrice != null ? Number(body.resellPrice) : null,
      robux_price: body.robuxPrice != null ? Number(body.robuxPrice) : null,
      is_active: !!body.visible,
      tech: body.tech && typeof body.tech === "object" ? body.tech : {},
    };
    if (Array.isArray(body.versions)) productFields.versions = body.versions;
    if (typeof body.storagePath === "string" && body.storagePath) productFields.storage_path = body.storagePath;

    let productId = id;
    if (id) {
      const { data: updated, error: updateErr } = await admin
        .from("products")
        .update(productFields)
        .eq("id", id)
        .select()
        .single();
      if (updateErr || !updated) return json({ ok: false, error: "Could not update product." }, 500);
    } else {
      const slug = await uniqueSlug(admin, slugify(title));
      const { data: created, error: insertErr } = await admin
        .from("products")
        .insert({ ...productFields, slug })
        .select()
        .single();
      if (insertErr || !created) return json({ ok: false, error: "Could not create product." }, 500);
      productId = created.id;
    }

    const legal: LegalPayload = body.legal && typeof body.legal === "object" ? body.legal : {};
    const legalFields = {
      product_id: productId,
      tos: legal.tos != null ? String(legal.tos) : "",
      proof_files: Array.isArray(legal.proofFiles) ? legal.proofFiles : [],
      dev_proof_files: Array.isArray(legal.devProofFiles) ? legal.devProofFiles : [],
      contacts: Array.isArray(legal.contacts) ? legal.contacts : [],
      license_cost: Math.max(0, Number(legal.licenseCost) || 0),
      license_cost_currency: legal.licenseCostCurrency === "robux" ? "robux" : "usd",
      license_purchased_at: legal.licensePurchasedAt || null,
      min_sale_usd: Math.max(0, Number(legal.minSaleUsd) || 0),
      min_sale_robux: Math.max(0, Number(legal.minSaleRobux) || 0),
      can_be_free: !!legal.canBeFree,
      disallow_sales: !!legal.disallowSales,
      updated_at: new Date().toISOString(),
    };
    const { error: legalErr } = await admin.from("product_legal").upsert(legalFields);
    if (legalErr) return json({ ok: false, error: "Product saved, but legal info failed to save." }, 500);

    return json({ ok: true, id: productId });
  } catch (err) {
    console.error("[admin-upsert-product] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
