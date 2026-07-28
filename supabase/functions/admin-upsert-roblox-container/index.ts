// supabase/functions/admin-upsert-roblox-container/index.ts
//
// Deploy with:
//   supabase functions deploy admin-upsert-roblox-container
//
// Lets an admin register a new Roblox "container" experience (or edit an
// existing one's label/active flag) in the roblox_containers pool that
// admin-upsert-product allocates gamepasses from. Does NOT create the
// Roblox experience itself - Roblox has no API for that. The admin must
// have already created an empty experience in Studio, and added it to
// their Open Cloud API key's game-passes permission list at
// https://create.roblox.com/dashboard/credentials, before registering
// it here.
//
// Body: { id? (edit an existing row), universeId, label, active }

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
    const id: string | undefined = body.id || undefined;
    const universeId = String(body.universeId || "").trim();
    const label = body.label != null ? String(body.label).trim() || null : null;
    const active = body.active !== false;

    if (!universeId) return json({ ok: false, error: "Universe ID is required." }, 400);
    if (!/^\d+$/.test(universeId)) return json({ ok: false, error: "Universe ID must be numeric." }, 400);

    const payload = { universe_id: universeId, label, active };
    const result = id
      ? await admin.from("roblox_containers").update(payload).eq("id", id).select().single()
      : await admin.from("roblox_containers").insert(payload).select().single();

    if (result.error) {
      const dup = /duplicate/i.test(result.error.message);
      return json({ ok: false, error: dup ? "That Universe ID is already registered." : "Could not save the container." }, 500);
    }

    return json({ ok: true, container: result.data });
  } catch (err) {
    console.error("[admin-upsert-roblox-container] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
