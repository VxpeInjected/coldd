// supabase/functions/track-pageview/index.ts
//
// Deploy with:
//   supabase functions deploy track-pageview --no-verify-jwt
//
// Public, unauthenticated - fires once per page load from catalog.js
// (loaded on every page). No PII: session_id is a random client-generated
// id that resets every browser session, not tied to any account.
//
// Body: { sessionId, path }

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
    const path = String(body.path || "").slice(0, 200);
    if (!sessionId) return json({ ok: true });

    await admin.from("page_views").insert({ session_id: sessionId, path });
    return json({ ok: true });
  } catch (err) {
    console.error("[track-pageview] error:", err);
    return json({ ok: true }); // never block the page load over this
  }
});
