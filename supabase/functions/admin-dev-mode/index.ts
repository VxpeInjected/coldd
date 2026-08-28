// supabase/functions/admin-dev-mode/index.ts
//
// Deploy with:
//   supabase functions deploy admin-dev-mode
//
// "Developer Mode": while on, the site auto-opens whenever an admin is
// working (the admin panel sends a heartbeat here on load and every few
// minutes) and a cron (dev-mode-auto-maintenance) returns it to
// maintenance after ~55 min with no heartbeat.
//
// is_admin gated like the other admin-* functions.
//
// Body:
//   { action: 'heartbeat' }        - bump the activity clock; if dev mode
//                                    is on and the site is in maintenance,
//                                    flip it to open.
//   { action: 'enable' | 'disable' } - turn Developer Mode on/off.
//                                    Enabling also does a heartbeat.
//
// Returns the current site_status row so the caller can update its UI.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
    if (!profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "heartbeat");

    const { data: cur } = await admin.from("site_status").select("*").eq("id", true).maybeSingle();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    if (action === "enable") {
      patch.dev_mode = true;
      patch.dev_mode_active_at = now;
      if (cur?.mode === "maintenance") { patch.mode = "open"; patch.maintenance_message = null; patch.maintenance_ends_at = null; }
    } else if (action === "disable") {
      patch.dev_mode = false;
      // Leave `mode` as it is - the owner sets open/maintenance explicitly
      // from here on.
    } else {
      // heartbeat
      patch.dev_mode_active_at = now;
      if (cur?.dev_mode && cur?.mode === "maintenance") {
        patch.mode = "open";
        patch.maintenance_message = null;
        patch.maintenance_ends_at = null;
      }
    }

    const { data: updated, error: updErr } = await admin
      .from("site_status").update(patch).eq("id", true).select().maybeSingle();
    if (updErr) return json({ ok: false, error: "Could not update Developer Mode." }, 500);

    return json({ ok: true, status: updated });
  } catch (err) {
    console.error("[admin-dev-mode] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
