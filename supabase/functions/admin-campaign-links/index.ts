// supabase/functions/admin-campaign-links/index.ts
//
// Deploy with:
//   supabase functions deploy admin-campaign-links
//
// Same auth/is_admin gate as the other admin-* functions. Manages
// campaign_links (see supabase/campaign_links.sql) - admin-created
// trackable marketing links, distinct from the user-to-user referral
// program. "list" returns each link with clicks/conversions/revenue
// computed from orders.campaign_code; "detail" returns the actual
// attributed orders for one link, for the per-link info popup.
//
// Body: { action: "list" }
//       { action: "detail", code }
//       { action: "create", code, label }
//       { action: "update", id, patch: { label?, active? } }
//       { action: "delete", id }

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

function slugify(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Must be a site-relative path (starts with "/", never "//" - that's
// protocol-relative and would point off-site) so the generated link can
// never send a click somewhere other than coldd.dev.
function sanitizeDestination(raw: string) {
  let path = String(raw || "/").trim();
  if (!path) path = "/";
  if (!path.startsWith("/") || path.startsWith("//")) path = "/";
  return path.slice(0, 200);
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
      const { data: links, error } = await admin.from("campaign_links").select("*").order("created_at", { ascending: false });
      if (error) return json({ ok: false, error: error.message }, 500);

      const { data: orders } = await admin
        .from("orders")
        .select("campaign_code, status, total_usd")
        .not("campaign_code", "is", null);

      const byCode: Record<string, { conversions: number; revenue: number }> = {};
      for (const o of orders ?? []) {
        const code = o.campaign_code as string;
        if (!byCode[code]) byCode[code] = { conversions: 0, revenue: 0 };
        if (o.status === "paid") {
          byCode[code].conversions += 1;
          byCode[code].revenue += Number(o.total_usd) || 0;
        }
      }

      const rows = (links ?? []).map((l) => {
        const agg = byCode[l.code] || { conversions: 0, revenue: 0 };
        return {
          id: l.id,
          code: l.code,
          label: l.label,
          destination: l.destination || "/",
          active: l.active,
          clicks: l.clicks,
          createdAt: l.created_at,
          conversions: agg.conversions,
          revenue: agg.revenue,
          conversionRate: l.clicks > 0 ? agg.conversions / l.clicks : null,
        };
      });

      return json({ ok: true, links: rows });
    }

    if (action === "detail") {
      const code = String(body.code || "").trim().toLowerCase();
      if (!code) return json({ ok: false, error: "Missing code." }, 400);

      const { data: orders, error } = await admin
        .from("orders")
        .select("id, status, total_usd, currency, created_at, paid_at, user_id, profiles(username, email)")
        .eq("campaign_code", code)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ ok: false, error: error.message }, 500);

      return json({
        ok: true,
        orders: (orders ?? []).map((o) => ({
          id: o.id,
          status: o.status,
          totalUsd: o.total_usd,
          currency: o.currency,
          createdAt: o.created_at,
          paidAt: o.paid_at,
          buyer: o.profiles ? ((o.profiles as { username?: string; email?: string }).username || (o.profiles as { email?: string }).email) : (o.user_id ? "Deleted account" : "Guest"),
        })),
      });
    }

    if (action === "create") {
      const code = slugify(String(body.code || ""));
      const label = String(body.label || "").trim().slice(0, 200);
      const destination = sanitizeDestination(String(body.destination || "/"));
      if (!code || !label) return json({ ok: false, error: "Code and label are required." }, 400);

      const { data, error } = await admin.from("campaign_links").insert({
        code, label, destination, created_by: userData.user.id,
      }).select().single();
      if (error) {
        if (error.code === "23505") return json({ ok: false, error: "That code is already in use." }, 400);
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, link: data });
    }

    if (action === "update") {
      const id = String(body.id || "");
      if (!id) return json({ ok: false, error: "Missing id." }, 400);
      const patchIn = body.patch || {};
      const patch: Record<string, unknown> = {};
      if (typeof patchIn.label === "string") patch.label = patchIn.label.trim().slice(0, 200);
      if (typeof patchIn.destination === "string") patch.destination = sanitizeDestination(patchIn.destination);
      if (typeof patchIn.active === "boolean") patch.active = patchIn.active;
      if (!Object.keys(patch).length) return json({ ok: false, error: "Nothing to update." }, 400);

      const { error } = await admin.from("campaign_links").update(patch).eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) return json({ ok: false, error: "Missing id." }, 400);
      const { error } = await admin.from("campaign_links").delete().eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[admin-campaign-links] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
