// supabase/functions/roblox-cookie-healthcheck/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-cookie-healthcheck --no-verify-jwt
//
// Called on a schedule by pg_cron/pg_net (see roblox_cookie_cron.sql),
// not by users - so it verifies a shared secret header instead of a
// Supabase user JWT (same reasoning as stripe-webhook's --no-verify-jwt,
// but authenticated with our own secret since Roblox doesn't sign
// anything back to us the way Stripe does).
//
// Validates the Phase D fallback's .ROBLOSECURITY cookie via a cheap
// authenticated Roblox call, updates roblox_cookie_health, and posts a
// Discord alert only on a healthy -> broken transition (so routine
// checks don't spam the channel).
//
// Required secrets:
//   ROBLOX_CRON_SECRET        - shared secret, must match the header the
//                                cron job sends
//   ROBLOX_FALLBACK_COOKIE    - the alt account's .ROBLOSECURITY value
//   ROBLOX_ALERT_WEBHOOK_URL  - optional Discord webhook for alerts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRobloxCookieBroken } from "../_shared/roblox.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const cronSecret = Deno.env.get("ROBLOX_CRON_SECRET");
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
      return json({ ok: false, error: "Unauthorized." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cookie = Deno.env.get("ROBLOX_FALLBACK_COOKIE");
    if (!cookie) {
      // Fallback not configured yet - nothing to check, not an error.
      return json({ ok: true, skipped: true });
    }

    const { data: prev } = await admin.from("roblox_cookie_health").select("ok").eq("id", true).maybeSingle();

    const res = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    const healthy = res.ok;
    const errorText = healthy ? null : `HTTP ${res.status} from users.roblox.com/v1/users/authenticated`;

    await admin
      .from("roblox_cookie_health")
      .update({ ok: healthy, last_checked_at: new Date().toISOString(), last_error: errorText })
      .eq("id", true);

    if (!healthy && (!prev || prev.ok)) {
      await notifyRobloxCookieBroken(errorText || "health check failed");
    }

    return json({ ok: true, healthy });
  } catch (err) {
    console.error("[roblox-cookie-healthcheck] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
