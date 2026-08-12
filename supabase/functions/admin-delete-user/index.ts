// supabase/functions/admin-delete-user/index.ts
//
// Deploy with:
//   supabase functions deploy admin-delete-user
//
// Deletes another account entirely - the auth identity via
// admin.auth.admin.deleteUser (cascades to profiles and everything else
// that references auth.users(id) on delete cascade), not just a status
// flag. Distinct from delete-account, which only ever deletes the calling
// user's own account - this is the admin-on-someone-else's-behalf version,
// gated to owner/admin roles, never support (matches the same bar as
// admin-set-staff-role).
//
// Body: { userId }

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
      .select("is_admin, role")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile?.is_admin || profile.role === "support") {
      return json({ ok: false, error: "Admin access required." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    if (userId === userData.user.id) return json({ ok: false, error: "You can't remove your own account from here." }, 400);

    const { data: target } = await admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if (target?.is_admin) return json({ ok: false, error: "Remove staff access first before deleting an admin account." }, 400);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ ok: false, error: delErr.message }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-delete-user] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
