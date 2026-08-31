// supabase/functions/admin-set-site-status/index.ts
//
// Deploy with:
//   supabase functions deploy admin-set-site-status
//
// Same auth/is_admin gate as the other admin-* functions. Sets the
// site-wide mode read by site-gate.js on every page load.
//
// Body: { mode: 'open'|'maintenance', message?, endsAt?, allowUsernames?: string[] }
//
// allowUsernames: the per-user maintenance bypass list. Each entry is
// matched (case-insensitively) against profiles.username and against a
// linked roblox_accounts.roblox_username; the resolved user ids are stored
// in site_status.maintenance_allow_user_ids. Send [] to clear it (disable
// the feature). Omit the key entirely to leave the list untouched.

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
    const mode = ["open", "maintenance"].includes(body.mode) ? body.mode : null;
    if (!mode) return json({ ok: false, error: "Invalid mode." }, 400);

    const patch: Record<string, unknown> = {
      mode,
      maintenance_message: body.message != null ? String(body.message).slice(0, 300) : null,
      maintenance_ends_at: body.endsAt || null,
      updated_at: new Date().toISOString(),
    };
    // An explicit choice from this panel wins over Developer Mode's
    // automatic flipping: setting maintenance by hand also switches
    // Developer Mode off (turn it back on when you want the auto-behaviour
    // again). Setting "open" by hand refreshes the activity clock so a
    // cron run doesn't immediately undo it.
    if (mode === "maintenance") patch.dev_mode = false;
    else patch.dev_mode_active_at = new Date().toISOString();

    // Per-user maintenance bypass list. Resolve usernames -> ids only when
    // the key is present (so a plain mode change doesn't wipe it).
    let resolved: string[] = [];
    let unresolved: string[] = [];
    if (Array.isArray(body.allowUsernames)) {
      const names = [...new Set(
        body.allowUsernames.map((n: unknown) => String(n || "").trim()).filter((n: string) => n && n.length <= 60),
      )] as string[];
      const idByName = new Map<string, string>();
      if (names.length) {
        const lc = names.map((n) => n.toLowerCase());
        const [{ data: profs }, { data: rbx }] = await Promise.all([
          admin.from("profiles").select("id, username").not("username", "is", null),
          admin.from("roblox_accounts").select("user_id, roblox_username").not("roblox_username", "is", null),
        ]);
        for (const p of profs || []) {
          const u = String(p.username || "").toLowerCase();
          if (lc.includes(u)) idByName.set(u, p.id);
        }
        for (const r of rbx || []) {
          const u = String(r.roblox_username || "").toLowerCase();
          if (lc.includes(u) && !idByName.has(u)) idByName.set(u, r.user_id);
        }
      }
      for (const n of names) {
        const id = idByName.get(n.toLowerCase());
        if (id) resolved.push(id);
        else unresolved.push(n);
      }
      patch.maintenance_allow_user_ids = [...new Set(resolved)];
    }

    const { error: updateErr } = await admin
      .from("site_status")
      .update(patch)
      .eq("id", true);
    if (updateErr) return json({ ok: false, error: "Could not update site status." }, 500);

    return json({ ok: true, resolvedCount: resolved.length, unresolved });
  } catch (err) {
    console.error("[admin-set-site-status] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
