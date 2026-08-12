// supabase/functions/admin-robux-pool/index.ts
//
// Deploy with:
//   supabase functions deploy admin-robux-pool
//
// Admin view/control for the order-queue gamepass pool (roblox_pool_passes -
// see _shared/roblox_pool.ts for how leasing works). Two actions:
//
//   { action: "stats" } - pool totals plus the individual pass rows, for the
//   admin "Robux pool" card.
//
//   { action: "seed", count } - provisions up to `count` new passes up front,
//   using the same provisionPass() logic create-robux-order falls back to when
//   it hits an empty pool. Exists so an admin can pre-warm the pool instead of
//   the very first buyers of the day paying the provisioning latency.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { provisionPass } from "../_shared/roblox_pool.ts";

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
    const action = String(body.action || "stats");

    if (action === "seed") {
      // Hard cap per call - this is a manual admin action, not a place to let a
      // typo burn through the container pool's 50-gamepass-per-universe limit.
      const count = Math.max(1, Math.min(10, Math.floor(Number(body.count) || 0)));
      let created = 0;
      const errors: string[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const ok = await provisionPass(admin);
          if (ok) created++;
          else { errors.push("Container pool is full - add another container game."); break; }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Unknown error provisioning a pass.");
          break;
        }
      }
      const { data: stats } = await admin.rpc("roblox_pool_stats").single();
      return json({ ok: true, created, errors, stats });
    }

    const { data: stats } = await admin.rpc("roblox_pool_stats").single();
    const { data: passes } = await admin
      .from("roblox_pool_passes")
      .select("id, gamepass_id, universe_id, label, active, leased_order_id, lease_expires_at, lease_price_robux, created_at")
      .order("created_at", { ascending: true });

    return json({ ok: true, stats, passes: passes ?? [] });
  } catch (err) {
    console.error("[admin-robux-pool] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
