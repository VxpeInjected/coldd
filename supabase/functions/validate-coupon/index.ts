// supabase/functions/validate-coupon/index.ts
//
// Deploy with:
//   supabase functions deploy validate-coupon
//
// No new secrets required - reuses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// / SUPABASE_ANON_KEY already relied on by the other functions.
//
// Lets checkout.html show a real, server-computed discount before the
// shopper commits to paying, without exposing the coupons table itself
// (no client read policy - this is the only way to check a code). Auth is
// optional, same as create-checkout-session, so guests can apply codes too.
// Uses the same pricing/scope-matching logic as create-checkout-session
// (via _shared/coupon.ts) so the number shown here always matches what
// actually gets charged.
//
// Rate limited per caller IP (supabase/rate_limits.sql) - this is the one
// guest-callable function that confirms whether a guessed code is valid,
// so without a limit it's a free oracle for brute-forcing discount codes.
// A shopper trying a code or two never notices; a script trying thousands
// gets 429s.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { priceItems, resolveCoupon } from "../_shared/coupon.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Supabase's edge gateway sets x-forwarded-for; take the first (client)
    // hop. No IP at all (shouldn't happen in practice) shares one bucket
    // rather than skipping the check.
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_key: `coupon:${ip}`,
      p_max: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    // Fail open on the limiter itself erroring - a broken rate-limit table
    // must never take down checkout's discount-code field.
    if (!rlErr && allowed === false) {
      return json({ ok: false, error: "Too many attempts. Please wait a minute and try again." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];

    const priced = await priceItems(admin, items);
    if (!priced.ok) return json({ ok: false, error: priced.error }, 400);

    const result = await resolveCoupon(admin, String(body.code || ""), priced.lines);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);

    return json({
      ok: true,
      code: result.code,
      discountUsd: result.discount,
      subtotalUsd: priced.subtotal,
      totalUsd: Math.max(0, Math.round((priced.subtotal - result.discount) * 100) / 100),
    });
  } catch (err) {
    console.error("[validate-coupon] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
