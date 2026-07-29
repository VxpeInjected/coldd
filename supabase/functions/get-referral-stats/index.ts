// supabase/functions/get-referral-stats/index.ts
//
// Deploy with:
//   supabase functions deploy get-referral-stats
//
// Returns the caller's own referral performance: code, clicks, signups,
// conversions, lifetime earnings (20% of each referred paid order,
// tracked separately per currency since a referred purchase can be USD
// or Robux), and available balance after already-requested/paid payouts.
//
// Body: {} (auth only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { REFERRAL_RATE } from "../_shared/referrals.ts";

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

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

    const { data: me } = await admin.from("profiles").select("referral_code, referral_clicks").eq("id", uid).single();

    const { data: referred } = await admin
      .from("profiles")
      .select("id, username, email, created_at")
      .eq("referred_by", uid)
      .order("created_at", { ascending: false });
    const referredIds = (referred || []).map((r: { id: string }) => r.id);

    let signups = referredIds.length;
    let conversions = 0;
    let earnedUsd = 0;
    let earnedRobux = 0;
    const convertedUsers = new Set<string>();
    const earnedByUser: Record<string, number> = {};

    if (referredIds.length) {
      const { data: orders } = await admin
        .from("orders")
        .select("user_id, currency, total_usd, total_robux")
        .in("user_id", referredIds)
        .eq("status", "paid");
      (orders || []).forEach((o: { user_id: string; currency: string; total_usd: number | null; total_robux: number | null }) => {
        convertedUsers.add(o.user_id);
        var amount = 0;
        if (o.currency === "robux") { amount = Number(o.total_robux || 0) * REFERRAL_RATE; earnedRobux += amount; }
        else { amount = Number(o.total_usd || 0) * REFERRAL_RATE; earnedUsd += amount; }
        earnedByUser[o.user_id] = (earnedByUser[o.user_id] || 0) + amount;
      });
      conversions = convertedUsers.size;
    }

    const recentReferrals = (referred || []).slice(0, 25).map((r: { id: string; username: string | null; email: string | null; created_at: string }) => ({
      name: r.username || (r.email ? r.email.split("@")[0] : "user"),
      date: r.created_at,
      converted: convertedUsers.has(r.id),
      earned: round2(earnedByUser[r.id] || 0),
    }));

    const { data: payouts } = await admin
      .from("referral_payouts")
      .select("method, amount_usd, amount_robux, status, requested_at, resolved_at")
      .eq("user_id", uid)
      .order("requested_at", { ascending: false });

    let reservedUsd = 0, reservedRobux = 0, paidUsd = 0, paidRobux = 0;
    (payouts || []).forEach((p: { method: string; amount_usd: number | null; amount_robux: number | null; status: string }) => {
      if (p.status === "denied") return;
      if (p.method === "robux") reservedRobux += Number(p.amount_robux || 0);
      else reservedUsd += Number(p.amount_usd || 0);
      if (p.status === "paid") {
        if (p.method === "robux") paidRobux += Number(p.amount_robux || 0);
        else paidUsd += Number(p.amount_usd || 0);
      }
    });

    return json({
      ok: true,
      code: me?.referral_code || null,
      clicks: me?.referral_clicks || 0,
      signups,
      conversions,
      earnedUsd: round2(earnedUsd),
      earnedRobux: Math.round(earnedRobux),
      availableUsd: round2(Math.max(0, earnedUsd - reservedUsd)),
      availableRobux: Math.max(0, Math.round(earnedRobux - reservedRobux)),
      paidUsd: round2(paidUsd),
      paidRobux: Math.round(paidRobux),
      payouts: payouts || [],
      recentReferrals: recentReferrals,
    });
  } catch (err) {
    console.error("[get-referral-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
