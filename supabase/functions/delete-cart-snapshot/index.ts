// supabase/functions/delete-cart-snapshot/index.ts
//
// Deploy with:
//   supabase functions deploy delete-cart-snapshot --no-verify-jwt
//
// Public (same reasoning as save-cart-snapshot). Called right after an
// order is actually created (Stripe checkout session or a Robux order),
// so a completed purchase never shows up as an "abandoned" cart.
//
// Body: { sessionId }

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "").slice(0, 64);
    if (sessionId) await admin.from("cart_snapshots").delete().eq("session_id", sessionId);

    return json({ ok: true });
  } catch (err) {
    console.error("[delete-cart-snapshot] error:", err);
    return json({ ok: true });
  }
});
