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
import { createGamepass, pickContainer, updateGamepass } from "../_shared/roblox.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const ROBUX_PER_USD = 80;

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

// Auto-announces a new product launch or a pushed version/update, so the
// admin doesn't have to remember to hand-write a matching Releases entry
// every time. Best-effort - failure here never blocks the product save.
async function autoCreateRelease(
  admin: ReturnType<typeof createClient>,
  opts: { productSlug: string; title: string; summary: string; kind: string; version?: string },
) {
  try {
    const base = (opts.version ? `${opts.productSlug}-${opts.version}` : `${opts.productSlug}-launch`)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "release";
    const slug = `${base}-${Date.now().toString(36)}`;
    await admin.from("content").insert({
      type: "release",
      slug,
      visible: true,
      data: {
        version: opts.version || "",
        kind: opts.kind,
        title: opts.title,
        date: new Date().toISOString().slice(0, 10),
        affects: [opts.productSlug],
        summary: opts.summary,
        details: "",
      },
    });
  } catch (err) {
    console.error("[admin-upsert-product] auto-release failed (non-blocking):", err);
  }
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
      page: platform === "Minecraft" ? "/minecraft" : "/assets",
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

    // Roblox products need a linked gamepass. If this one doesn't have
    // one yet (brand new, or platform just switched to Roblox), a
    // container with room must be reserved BEFORE any product row is
    // written - Roblox has no API to create a new experience, so once
    // every container hits 50 gamepasses this has to hard-block, not
    // silently create an unsellable product.
    // deno-lint-ignore no-explicit-any
    let existingProduct: { roblox_gamepass_id: string | null; roblox_universe_id: string | null; versions: any[] | null; slug: string } | null = null;
    if (id) {
      const { data } = await admin
        .from("products")
        .select("roblox_gamepass_id, roblox_universe_id, versions, slug")
        .eq("id", id)
        .maybeSingle();
      existingProduct = data;
    }
    const needsNewGamepass = platform === "Roblox" && !(existingProduct && existingProduct.roblox_gamepass_id);
    let newContainer: Awaited<ReturnType<typeof pickContainer>> = null;
    if (needsNewGamepass) {
      newContainer = await pickContainer(admin);
      if (!newContainer) {
        return json({
          ok: false,
          error: "No Roblox container game has room for a new gamepass - every container is at the 50-gamepass limit. Add a new one in Admin → Roblox (you'll need to create an empty experience in Roblox Studio first, and add it to your Open Cloud API key at https://create.roblox.com/dashboard/credentials).",
        }, 409);
      }
    }

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

    let robloxWarning: string | undefined;
    if (platform === "Roblox") {
      const robuxPrice = productFields.robux_price != null
        ? Number(productFields.robux_price)
        : Math.round(price * ROBUX_PER_USD);

      if (needsNewGamepass && newContainer) {
        try {
          const gp = await createGamepass(newContainer.universe_id, {
            name: title,
            description: (productFields.description as string) || undefined,
            price: robuxPrice,
          });
          const gamePassId = String(gp.gamePassId);
          const { error: linkErr } = await admin
            .from("products")
            .update({ roblox_gamepass_id: gamePassId, roblox_universe_id: newContainer.universe_id })
            .eq("id", productId);
          if (linkErr) throw new Error("Gamepass created but could not be linked to the product.");
          await admin.rpc("increment_roblox_container", { p_id: newContainer.id });
        } catch (gpErr) {
          console.error("[admin-upsert-product] gamepass creation failed:", gpErr);
          // A brand-new product with no gamepass is a broken half-state,
          // not something to leave live - roll it back. An existing
          // product that just switched to Roblox keeps its other fields
          // saved (non-fatal), it just stays without a gamepass.
          if (!id) await admin.from("products").delete().eq("id", productId);
          return json({
            ok: false,
            error: "Could not create the Roblox gamepass: " + ((gpErr as Error).message || "unknown error") +
              " (check your Open Cloud API key at https://create.roblox.com/dashboard/credentials).",
          }, 502);
        }
      } else if (existingProduct?.roblox_gamepass_id && existingProduct.roblox_universe_id) {
        try {
          await updateGamepass(existingProduct.roblox_universe_id, existingProduct.roblox_gamepass_id, {
            name: title,
            description: (productFields.description as string) || undefined,
            price: robuxPrice,
          });
        } catch (gpErr) {
          console.warn("[admin-upsert-product] gamepass sync failed (non-blocking):", gpErr);
          robloxWarning = "Product saved, but the Roblox gamepass could not be synced: " +
            ((gpErr as Error).message || "unknown error") +
            ". Retry the save once resolved, or check your Open Cloud API key at https://create.roblox.com/dashboard/credentials.";
        }
      }
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

    // Auto-announce: brand-new product launch, or a newly pushed version
    // on an existing one (versions is append-only, so a longer array means
    // a new entry landed at the end).
    if (!id && !!body.visible) {
      const { data: newRow } = await admin.from("products").select("slug").eq("id", productId).single();
      if (newRow?.slug) {
        await autoCreateRelease(admin, {
          productSlug: newRow.slug,
          title: `${title} launches`,
          summary: (productFields.description as string) || `${title} is now available.`,
          kind: "Feature",
        });
      }
    } else if (id && existingProduct && Array.isArray(body.versions)) {
      const oldVersions = existingProduct.versions || [];
      if (body.versions.length > oldVersions.length) {
        const latest = body.versions[body.versions.length - 1];
        await autoCreateRelease(admin, {
          productSlug: existingProduct.slug,
          title: `${title} — ${latest?.version || "update"}`,
          summary: latest?.changelog || `${title} was updated.`,
          kind: "Fix",
          version: latest?.version,
        });
      }
    }

    return json({ ok: true, id: productId, robloxWarning });
  } catch (err) {
    console.error("[admin-upsert-product] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
