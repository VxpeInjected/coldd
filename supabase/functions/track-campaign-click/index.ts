// supabase/functions/track-campaign-click/index.ts
//
// Deploy with:
//   supabase functions deploy track-campaign-click --no-verify-jwt
//
// Public, unauthenticated - fires when anyone loads a page with ?cmp=CODE
// in the URL (an admin-managed campaign link, not the user referral
// system). Pure click counter, same trust model as track-referral-click:
// never blocks the page load, never errors out to the caller.
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

    const { data: link } = await admin.from("campaign_links").select("id, clicks").eq("code", code).eq("active", true).maybeSingle();
    if (link) {
      await admin.from("campaign_links").update({ clicks: (link.clicks || 0) + 1 }).eq("id", link.id);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[track-campaign-click] error:", err);
    return json({ ok: true }); // never block the page load over this
  }
});
