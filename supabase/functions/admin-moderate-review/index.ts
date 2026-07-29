// supabase/functions/admin-moderate-review/index.ts
//
// Deploy with:
//   supabase functions deploy admin-moderate-review
//
// Same auth/is_admin gate as the other admin-* functions.
//
// Body: { id, action: 'approve'|'hide'|'reply', reply? }

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
    const id = String(body.id || "");
    const action = body.action;
    if (!id || !["approve", "hide", "reply"].includes(action)) return json({ ok: false, error: "Invalid request." }, 400);

    let update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === "approve") update.status = "approved";
    else if (action === "hide") update.status = "hidden";
    else if (action === "reply") {
      update.reply = body.reply ? String(body.reply).trim().slice(0, 2000) || null : null;
      update.reply_at = new Date().toISOString();
    }

    const { error: updateErr } = await admin.from("reviews").update(update).eq("id", id);
    if (updateErr) return json({ ok: false, error: "Could not update review." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-moderate-review] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
