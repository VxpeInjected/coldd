// supabase/functions/request-referral-payout/index.ts
//
// Deploy with:
//   supabase functions deploy request-referral-payout
//
// Validates the requested amount against the caller's actual available
// balance (same computation as get-referral-stats) before inserting a
// 'requested' row - payouts are never automated, an admin marks them
// paid/denied by hand from the admin panel.
//
// Body: { method: 'usd'|'robux'|'store_credit', amount }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const METHODS = ["usd", "robux", "store_credit"];

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
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const method = String(body.method || "");
    if (!METHODS.includes(method)) return json({ ok: false, error: "Invalid payout method." }, 400);
    const requestedAmount = Number(body.amount);
    if (!requestedAmount || requestedAmount <= 0) return json({ ok: false, error: "Enter an amount." }, 400);

    // The balance check + insert happen atomically inside this single
    // Postgres function (see supabase/referral_payout_atomic.sql), serialized
    // per-user with an advisory lock - closes the check-then-act race that a
    // separate SELECT-then-INSERT here would have.
    const { data: result, error: rpcErr } = await admin.rpc("request_referral_payout", {
      p_user_id: uid,
      p_method: method,
      p_amount: requestedAmount,
    });
    if (rpcErr) {
      console.error("[request-referral-payout] rpc error:", rpcErr);
      return json({ ok: false, error: "Could not submit payout request." }, 500);
    }
    if (!result?.ok) return json({ ok: false, error: result?.error || "Could not submit payout request." }, 400);

    return json({ ok: true });
  } catch (err) {
    console.error("[request-referral-payout] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
