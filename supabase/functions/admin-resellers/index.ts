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
      // The tracker is driven by resell LICENCES, not by who filled in the
      // form. Every paid resell order_item is a reseller; the resellers row
      // (if any) just adds their onboarding answers on top.
      const [{ data: items, error: itemsErr }, { data: rows, error: rowsErr }] = await Promise.all([
        admin.from("order_items")
          .select("id, product_id, product_slug, title, orders!inner(id, user_id, created_at, status)")
          .eq("licence", "resell").eq("orders.status", "paid"),
        admin.from("resellers")
          .select("id, user_id, order_item_id, product_id, email, display_name, contact_type, contact_value, selling_locations, selling_where, selling_notes, status, source, created_at"),
      ]);
      if (itemsErr || rowsErr) return json({ ok: false, error: (itemsErr || rowsErr)!.message }, 500);

      const uids = new Set<string>();
      const pids = new Set<string>();
      (items || []).forEach((it: { orders?: { user_id?: string }; product_id?: string }) => {
        if (it.orders?.user_id) uids.add(it.orders.user_id);
      });
      (rows || []).forEach((r: { user_id?: string; product_id?: string }) => {
        if (r.user_id) uids.add(r.user_id);
        if (r.product_id) pids.add(r.product_id);
      });
      const [{ data: profs }, { data: prods }] = await Promise.all([
        uids.size ? admin.from("profiles").select("id, username, email").in("id", [...uids]) : Promise.resolve({ data: [] }),
        pids.size ? admin.from("products").select("id, title, slug").in("id", [...pids]) : Promise.resolve({ data: [] }),
      ]);
      const profById = new Map((profs || []).map((p: { id: string }) => [p.id, p]));
      const prodById = new Map((prods || []).map((p: { id: string }) => [p.id, p]));
      const rowByItem = new Map((rows || []).filter((r: { order_item_id?: string }) => r.order_item_id).map((r: { order_item_id: string }) => [r.order_item_id, r]));

      // deno-lint-ignore no-explicit-any
      const entry = (base: any, r: any) => ({
        id: r?.id || null,
        orderItemId: base.orderItemId,
        orderId: base.orderId,
        userId: base.userId,
        licencedAt: base.licencedAt,
        productTitle: base.productTitle,
        productSlug: base.productSlug,
        productId: base.productId,
        accountName: base.accountName,
        accountEmail: base.accountEmail,
        onboarded: !!r,
        contactType: r?.contact_type || null,
        contactValue: r?.contact_value || r?.email || null,
        sellingLocations: Array.isArray(r?.selling_locations) ? r.selling_locations : [],
        sellingWhere: r?.selling_where || null,
        sellingNotes: r?.selling_notes || null,
        status: r?.status || "active",
        source: r?.source || "purchase",
        createdAt: r?.created_at || base.licencedAt,
      });

      const used = new Set<string>();
      const list = [];
      // deno-lint-ignore no-explicit-any
      for (const it of (items || []) as any[]) {
        const r = rowByItem.get(it.id);
        if (r) used.add(r.id);
        const prof = profById.get(it.orders?.user_id) as { username?: string; email?: string } | undefined;
        list.push(entry({
          orderItemId: it.id, orderId: it.orders?.id, userId: it.orders?.user_id || null,
          licencedAt: it.orders?.created_at, productTitle: it.title, productSlug: it.product_slug, productId: it.product_id,
          accountName: prof ? (prof.username || prof.email) : null, accountEmail: prof?.email || null,
        }, r));
      }
      // Manual / external resellers rows not attached to a paid resell licence.
      // deno-lint-ignore no-explicit-any
      for (const r of (rows || []) as any[]) {
        if (used.has(r.id)) continue;
        const prof = profById.get(r.user_id) as { username?: string; email?: string } | undefined;
        const prod = prodById.get(r.product_id) as { title?: string; slug?: string } | undefined;
        list.push(entry({
          orderItemId: r.order_item_id || null, orderId: null, userId: r.user_id || null,
          licencedAt: r.created_at, productTitle: prod?.title || null, productSlug: prod?.slug || null, productId: r.product_id || null,
          accountName: prof ? (prof.username || prof.email) : (r.display_name || null), accountEmail: prof?.email || r.email || null,
        }, r));
      }
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ ok: true, resellers: list });
    }

    if (action === "create") {
      const contactType = body.contactType === "discord" ? "discord" : "email";
      const contactValue = String(body.contactValue || "").trim().slice(0, 200);
      const locations = cleanLocations(body.sellingLocations);
      if (!contactValue) return json({ ok: false, error: "A contact email or Discord is required." }, 400);
      if (contactType === "email" && !EMAIL_RE.test(contactValue)) return json({ ok: false, error: "Enter a valid contact email." }, 400);
      if (!locations.length) return json({ ok: false, error: "Add at least one place they're selling, with a link." }, 400);

      // Onboarding an existing paid resell licence straight from the tracker:
      // the client passes the order_item / user / product, and we upsert on
      // order_item_id so it lines up with that buyer's own seller profile.
      const orderItemId = String(body.orderItemId || "").trim() || null;
      let userId: string | null = String(body.userId || "").trim() || null;
      let productId: string | null = body.productId || null;
      let orderId: string | null = null;
      if (orderItemId) {
        const { data: oi } = await admin
          .from("order_items")
          .select("product_id, order_id, orders(user_id)")
          .eq("id", orderItemId)
          .maybeSingle();
        if (oi) {
          productId = oi.product_id;
          orderId = oi.order_id;
          // deno-lint-ignore no-explicit-any
          userId = (oi as any).orders?.user_id ?? userId;
        }
      }
      // Otherwise, link by matching contact email to an account.
      if (!userId && contactType === "email") {
        const { data: prof } = await admin.from("profiles").select("id").ilike("email", contactValue).maybeSingle();
        userId = prof?.id ?? null;
      }

      const record = {
        user_id: userId,
        order_id: orderId,
        order_item_id: orderItemId,
        email: contactType === "email" ? contactValue : null,
        contact_type: contactType,
        contact_value: contactValue,
        selling_locations: locations,
        selling_where: locSummary(locations),
        display_name: body.displayName ? String(body.displayName).trim().slice(0, 200) : null,
        product_id: productId,
        status: body.status === "inactive" ? "inactive" : "active",
        selling_notes: body.sellingNotes ? String(body.sellingNotes).trim().slice(0, 2000) : null,
        source: orderItemId ? "purchase" : "manual",
      };
      const q = orderItemId
        ? admin.from("resellers").upsert(record, { onConflict: "order_item_id" })
        : admin.from("resellers").insert(record);
      const { data, error } = await q
        .select("id, user_id, email, display_name, contact_type, contact_value, selling_locations, selling_where, selling_notes, status, source, created_at, products(title, slug), profiles(username, email)")
        .single();
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
