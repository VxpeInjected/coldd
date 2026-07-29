// supabase/functions/admin-upsert-content/index.ts
//
// Deploy with:
//   supabase functions deploy admin-upsert-content
//
// Same auth/is_admin gate as the other admin-* functions. Backs the
// Blog/Tutorials/Releases CMS panels - one generic upsert for all three
// content types.
//
// Body: { id?, type: 'post'|'tutorial'|'release', slug, visible, data }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const TYPES = ["post", "tutorial", "release"];

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
    const type = String(body.type || "");
    if (!TYPES.includes(type)) return json({ ok: false, error: "Invalid content type." }, 400);

    const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) return json({ ok: false, error: "Missing or invalid slug." }, 400);

    const visible = !!body.visible;
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const id = body.id ? String(body.id) : null;

    const row = { type, slug, visible, data, updated_at: new Date().toISOString() };

    const result = id
      ? await admin.from("content").update(row).eq("id", id).eq("type", type).select().single()
      : await admin.from("content").upsert(row, { onConflict: "type,slug" }).select().single();

    if (result.error) return json({ ok: false, error: "Could not save content." }, 500);

    return json({ ok: true, id: result.data.id });
  } catch (err) {
    console.error("[admin-upsert-content] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
