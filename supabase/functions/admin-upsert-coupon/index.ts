// supabase/functions/admin-upsert-coupon/index.ts
//
// Deploy with:
//   supabase functions deploy admin-upsert-coupon
//
// Backend for the admin panel's discount-code create/edit form. Same
// auth/is_admin gate as admin-upsert-product. code is the primary key, so
// "editing" a coupon whose code changed is a rename: delete the old row,
// insert the new one, inside a best-effort sequence (not a transaction -
// acceptable here since coupons aren't referenced by foreign key from
// orders, only by the plain-text coupon_code column).

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
    const editingCode: string | undefined = body.editingCode ? String(body.editingCode).trim().toUpperCase() : undefined;
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) return json({ ok: false, error: "Enter a code." }, 400);

    const type = body.type === "flat" ? "flat" : "pct";
    const val = Math.max(0, Number(body.val) || 0);
    if (!val) return json({ ok: false, error: "Enter a value." }, 400);

    const scope = body.scope === "platform" || body.scope === "category" ? body.scope : "sitewide";
    const platform = scope !== "sitewide" && body.platform ? String(body.platform) : null;
    const category = scope === "category" && body.category ? String(body.category) : null;

    if (editingCode && editingCode !== code) {
      // Renaming: make sure the new code isn't already taken, then delete
      // the old row and insert fresh (see file header).
      const { data: clash } = await admin.from("coupons").select("code").eq("code", code).maybeSingle();
      if (clash) return json({ ok: false, error: "That code is already in use." }, 400);
      await admin.from("coupons").delete().eq("code", editingCode);
    }

    const row = {
      code,
      type,
      val,
      active: body.active !== false,
      usage_limit: body.usageLimit != null && body.usageLimit !== "" ? Math.max(0, Number(body.usageLimit) || 0) : null,
      expires_at: body.expiresAt || null,
      scope,
      platform,
      category,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = editingCode && editingCode === code
      ? await admin.from("coupons").update(row).eq("code", code)
      : await admin.from("coupons").upsert(row);
    if (upsertErr) {
      if (String(upsertErr.message || "").includes("duplicate")) {
        return json({ ok: false, error: "That code is already in use." }, 400);
      }
      return json({ ok: false, error: "Could not save the code." }, 500);
    }

    return json({ ok: true, code });
  } catch (err) {
    console.error("[admin-upsert-coupon] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
