// supabase/functions/track-referral-click/index.ts
//
// Deploy with:
//   supabase functions deploy track-referral-click --no-verify-jwt
//
// Public, unauthenticated - fires when anyone loads a page with ?ref=CODE
// in the URL, purely a vanity click counter for the referrer's dashboard.
// Not used for anything financial (only paid orders count toward
// earnings), so no auth/rate-limiting beyond the obvious is worth the
// complexity here.
//
// Body: { code }

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
    const code = String(body.code || "").trim().toLowerCase();
    if (!code) return json({ ok: false }, 200);

    const { data: profile } = await admin.from("profiles").select("id, referral_clicks").eq("referral_code", code).maybeSingle();
    if (profile) {
      await admin.from("profiles").update({ referral_clicks: (profile.referral_clicks || 0) + 1 }).eq("id", profile.id);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[track-referral-click] error:", err);
    return json({ ok: true }); // never block the page load over this
  }
});
