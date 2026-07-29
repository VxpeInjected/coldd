// supabase/functions/admin-set-user-banned/index.ts
//
// Deploy with:
//   supabase functions deploy admin-set-user-banned
//
// Same auth/is_admin gate as the other admin-* functions. Refuses to ban
// another admin (avoids an admin accidentally locking out a co-admin -
// demote them first via Staff & Whitelist if that's really the intent)
// or the caller's own account.
//
// Body: { userId, banned, reason? }

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

    const { data: callerProfile, error: callerErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (callerErr || !callerProfile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.userId || "");
    const banned = !!body.banned;
    if (!targetId) return json({ ok: false, error: "Missing userId." }, 400);
    if (targetId === userData.user.id) return json({ ok: false, error: "You can't ban your own account." }, 400);

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", targetId)
      .single();
    if (targetErr || !target) return json({ ok: false, error: "User not found." }, 404);
    if (target.is_admin) return json({ ok: false, error: "Can't ban another admin - remove their admin access first." }, 400);

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ banned, ban_reason: banned ? (body.reason ? String(body.reason).slice(0, 300) : "Banned by staff") : null })
      .eq("id", targetId);
    if (updateErr) return json({ ok: false, error: "Could not update user." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-set-user-banned] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
