// supabase/functions/admin-delete-coupon/index.ts
//
// Deploy with:
//   supabase functions deploy admin-delete-coupon
//
// Same auth/is_admin pattern as the other admin-* functions. Hard-deletes
// (unlike admin-delete-product's soft delete) - coupons.code isn't
// referenced by a foreign key from orders (orders.coupon_code is plain
// text, just a record of what was typed at checkout), so there's no
// referential-integrity reason to keep the row around once an admin wants
// it gone.

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
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) return json({ ok: false, error: "Missing coupon code." }, 400);

    const { error: delErr } = await admin.from("coupons").delete().eq("code", code);
    if (delErr) return json({ ok: false, error: "Could not delete the code." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-delete-coupon] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
