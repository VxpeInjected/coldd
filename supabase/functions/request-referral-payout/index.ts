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
import { REFERRAL_RATE } from "../_shared/referrals.ts";

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

    const { data: referred } = await admin.from("profiles").select("id").eq("referred_by", uid);
    const referredIds = (referred || []).map((r: { id: string }) => r.id);

    let earnedUsd = 0, earnedRobux = 0;
    if (referredIds.length) {
      const { data: orders } = await admin
        .from("orders")
        .select("currency, total_usd, total_robux")
        .in("user_id", referredIds)
        .eq("status", "paid");
      (orders || []).forEach((o: { currency: string; total_usd: number | null; total_robux: number | null }) => {
        if (o.currency === "robux") earnedRobux += Number(o.total_robux || 0) * REFERRAL_RATE;
        else earnedUsd += Number(o.total_usd || 0) * REFERRAL_RATE;
      });
    }

    const { data: payouts } = await admin
      .from("referral_payouts")
      .select("method, amount_usd, amount_robux, status")
      .eq("user_id", uid)
      .neq("status", "denied");

    let reservedUsd = 0, reservedRobux = 0;
    (payouts || []).forEach((p: { method: string; amount_usd: number | null; amount_robux: number | null }) => {
      if (p.method === "robux") reservedRobux += Number(p.amount_robux || 0);
      else reservedUsd += Number(p.amount_usd || 0);
    });

    const row: Record<string, unknown> = { user_id: uid, method, status: "requested" };
    if (method === "robux") {
      const available = Math.max(0, earnedRobux - reservedRobux);
      if (requestedAmount > available) return json({ ok: false, error: "Amount exceeds your available Robux balance." }, 400);
      row.amount_robux = Math.round(requestedAmount);
    } else {
      const available = Math.max(0, earnedUsd - reservedUsd);
      if (requestedAmount > available) return json({ ok: false, error: "Amount exceeds your available USD balance." }, 400);
      row.amount_usd = Math.round(requestedAmount * 100) / 100;
    }

    const { error: insErr } = await admin.from("referral_payouts").insert(row);
    if (insErr) return json({ ok: false, error: "Could not submit payout request." }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[request-referral-payout] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
