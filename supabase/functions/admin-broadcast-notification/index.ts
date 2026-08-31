// supabase/functions/admin-broadcast-notification/index.ts
//
// Deploy with:
//   supabase functions deploy admin-broadcast-notification
//
// Admin-only. Fans one notification out into public.notifications for a whole
// audience - the in-app "bell", not email. Use it for store-wide sale alerts
// or any announcement everyone should see next time they load the site.
//
// Body:
//   { action: "count", audience }                     -> { ok, count }
//   { action: "send", audience, kind, title, body?, url? } -> { ok, sent }
//
//   audience: "all"       - every account
//             "customers" - accounts with at least one paid order
//   kind:     "sale"      - skips anyone who turned off inAppSales
//             "general"   - goes to everyone in the audience

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

// deno-lint-ignore no-explicit-any
async function resolveAudience(admin: any, audience: string): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (audience === "customers") {
    const { data: orders } = await admin.from("orders").select("user_id").eq("status", "paid").not("user_id", "is", null);
    const ids = [...new Set((orders ?? []).map((o: { user_id: string }) => o.user_id))];
    if (!ids.length) return out;
    // Chunk the profiles lookup - `.in()` on thousands of ids is unwise.
    for (let i = 0; i < ids.length; i += 500) {
      const { data: profs } = await admin.from("profiles").select("id, notification_prefs").in("id", ids.slice(i, i + 500));
      (profs ?? []).forEach((p: { id: string; notification_prefs: Record<string, unknown> | null }) => out.set(p.id, p.notification_prefs || {}));
    }
    return out;
  }
  // "all"
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data: profs } = await admin.from("profiles").select("id, notification_prefs").range(from, from + PAGE - 1);
    if (!profs || !profs.length) break;
    profs.forEach((p: { id: string; notification_prefs: Record<string, unknown> | null }) => out.set(p.id, p.notification_prefs || {}));
    if (profs.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from("profiles").select("is_admin, username, email").eq("id", userData.user.id).single();
    if (!profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);
    const actorName = profile.username || profile.email || "admin";

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const audience = body.audience === "customers" ? "customers" : "all";

    if (action === "count") {
      const map = await resolveAudience(admin, audience);
      return json({ ok: true, count: map.size });
    }

    if (action === "send") {
      const kind = body.kind === "sale" ? "sale" : "general";
      const title = String(body.title || "").trim().slice(0, 120);
      const bodyText = body.body ? String(body.body).trim().slice(0, 400) : null;
      const url = body.url ? String(body.url).trim().slice(0, 300) : null;
      if (!title) return json({ ok: false, error: "A title is required." }, 400);
      if (url && !/^(https?:)?\/\/|^\//.test(url)) return json({ ok: false, error: "The link must be a path (/…) or a full URL." }, 400);

      const map = await resolveAudience(admin, audience);
      let recipients = [...map.entries()];
      if (kind === "sale") recipients = recipients.filter(([, prefs]) => prefs.inAppSales !== false);
      if (!recipients.length) return json({ ok: true, sent: 0 });

      const rows = recipients.map(([uid]) => ({ user_id: uid, title, body: bodyText, url }));
      let sent = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("notifications").insert(rows.slice(i, i + 500));
        if (error) return json({ ok: false, error: error.message, sent }, 500);
        sent += Math.min(500, rows.length - i);
      }
      await admin.from("admin_audit_log").insert({
        actor_id: userData.user.id, actor_name: actorName,
        action: `Broadcast notification "${title}" to ${sent} ${audience === "customers" ? "customers" : "accounts"} (${kind})`,
      }).then(() => {}, () => {});
      return json({ ok: true, sent });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[admin-broadcast-notification] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
