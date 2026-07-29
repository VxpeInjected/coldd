// supabase/functions/save-cart-snapshot/index.ts
//
// Deploy with:
//   supabase functions deploy save-cart-snapshot --no-verify-jwt
//
// Public - checkout works for signed-out guests too, so this can't
// require auth. If a valid session IS present, the snapshot gets tied to
// that account (for the admin panel's email column); otherwise it's
// anonymous. Called (debounced) whenever someone views checkout with
// items in their cart, or edits the cart from there.
//
// Body: { sessionId, items, valueUsd }

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "").slice(0, 64);
    if (!sessionId) return json({ ok: true });

    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    const valueUsd = Math.max(0, Number(body.valueUsd) || 0);
    if (!items.length) {
      await admin.from("cart_snapshots").delete().eq("session_id", sessionId);
      return json({ ok: true });
    }

    let userId: string | null = null;
    let email: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        userId = userData.user.id;
        const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).single();
        email = profile?.email || userData.user.email || null;
      }
    }

    await admin.from("cart_snapshots").upsert({
      session_id: sessionId,
      user_id: userId,
      email,
      items,
      value_usd: Math.round(valueUsd * 100) / 100,
      updated_at: new Date().toISOString(),
    });

    return json({ ok: true });
  } catch (err) {
    console.error("[save-cart-snapshot] error:", err);
    return json({ ok: true }); // never block checkout over this
  }
});
