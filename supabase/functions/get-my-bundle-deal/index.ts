// supabase/functions/get-my-bundle-deal/index.ts
//
// Deploy with:
//   supabase functions deploy get-my-bundle-deal
//
// Auth-scoped counterpart to get-bundle-deal: instead of needing a
// ?bundle= token from an email link, a signed-in visitor's own dashboard
// can just ask "is there an active bundle deal minted for me right now"
// (the wishlist reminder mints one with user_id set - see
// cron-lifecycle-emails's runWishlistReminder). Without this, the
// wishlist panel would only ever show a deal to someone who happened to
// click through from the actual reminder email in that exact browser,
// which is a much narrower audience than "signed in and has one waiting".
//
// Body: {} (auth only)

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
    const { data: row } = await admin
      .from("bundle_deals")
      .select("token, slugs, item_pct, bundle_pct, expires_at")
      .eq("user_id", userData.user.id)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return json({ ok: false, error: "No active deal." }, 404);

    return json({ ok: true, token: row.token, slugs: row.slugs, itemPct: row.item_pct, bundlePct: row.bundle_pct });
  } catch (err) {
    console.error("[get-my-bundle-deal] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
