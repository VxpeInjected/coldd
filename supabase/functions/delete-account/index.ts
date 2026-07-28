// supabase/functions/delete-account/index.ts
//
// Deploy with:
//   supabase functions deploy delete-account
//
// Deletes the CALLING user's own account only - identified via their own
// JWT, never a client-supplied id. Uses the service role internally
// (auto-provided, never exposed to the client) since user deletion
// requires admin privileges.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Not authenticated." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: delErr } = await admin.auth.admin.deleteUser(userData.user.id);
    if (delErr) return json({ ok: false, error: delErr.message }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
