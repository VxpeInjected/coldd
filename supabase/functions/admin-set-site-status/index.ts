// supabase/functions/admin-set-site-status/index.ts
//
// Deploy with:
//   supabase functions deploy admin-set-site-status
//
// Same auth/is_admin gate as the other admin-* functions. Sets the
// site-wide mode read by site-gate.js on every page load.
//
// Body: { mode: 'open'|'maintenance', message?, endsAt? }

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

    const { error: updateErr } = await admin
      .from("site_status")
      .update({
        mode,
        maintenance_message: body.message != null ? String(body.message).slice(0, 300) : null,
        maintenance_ends_at: body.endsAt || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (updateErr) return json({ ok: false, error: "Could not update site status." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-set-site-status] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
