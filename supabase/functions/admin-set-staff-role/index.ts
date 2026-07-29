// supabase/functions/admin-set-staff-role/index.ts
//
// Deploy with:
//   supabase functions deploy admin-set-staff-role
//
// Grants/changes/revokes admin access. Unlike the other admin-* functions
// (which only require is_admin=true), this one requires the CALLER to be
// an 'owner' - it controls who else gets into the admin panel at all, so
// a plain admin/support account can't use it to promote themselves or
// anyone else. Refuses to let an owner change their own role (avoids
// accidentally locking themselves out).
//
// Body: { email, role: 'owner'|'admin'|'support'|null }
//   role: null revokes admin access entirely (is_admin -> false).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const ROLES = ["owner", "admin", "support"];

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
      .select("is_admin, role")
      .eq("id", userData.user.id)
      .single();
    if (callerErr || !callerProfile?.is_admin || callerProfile.role !== "owner") {
      return json({ ok: false, error: "Only owners can manage staff access." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const role = body.role === null ? null : String(body.role || "");
    if (!email) return json({ ok: false, error: "Missing email." }, 400);
    if (role !== null && !ROLES.includes(role)) return json({ ok: false, error: "Invalid role." }, 400);

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, username, email")
      .ilike("email", email)
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: "Lookup failed." }, 500);
    if (!target) return json({ ok: false, error: "No account with that email has signed in yet." }, 404);
    if (target.id === userData.user.id) return json({ ok: false, error: "You can't change your own role here." }, 400);

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ is_admin: role !== null, role })
      .eq("id", target.id);
    if (updateErr) return json({ ok: false, error: "Could not update staff access." }, 500);

    return json({ ok: true, username: target.username || target.email });
  } catch (err) {
    console.error("[admin-set-staff-role] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
