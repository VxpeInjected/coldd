// supabase/functions/admin-manage-referral-payout/index.ts
//
// Deploy with:
//   supabase functions deploy admin-manage-referral-payout
//
// Same auth/is_admin gate as the other admin-* functions. Payouts are
// never sent automatically - this just records that an admin manually
// sent (or declined) one outside the system.
//
// Body: { id, action: 'mark_paid'|'deny', note? }

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
    if (!id || !["mark_paid", "deny"].includes(action)) return json({ ok: false, error: "Invalid request." }, 400);

    const update: Record<string, unknown> = {
      status: action === "mark_paid" ? "paid" : "denied",
      resolved_at: new Date().toISOString(),
    };
    if (body.note != null) update.note = String(body.note).trim().slice(0, 500) || null;

    const { error: updateErr } = await admin.from("referral_payouts").update(update).eq("id", id);
    if (updateErr) return json({ ok: false, error: "Could not update payout." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[admin-manage-referral-payout] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
