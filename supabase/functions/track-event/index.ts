// supabase/functions/track-event/index.ts
//
// Deploy with:
//   supabase functions deploy track-event --no-verify-jwt
//
// Public, unauthenticated - the site-wide funnel/interaction beacon
// (window.coldTrack in catalog.js). Companion to track-pageview: same
// no-PII, consent-gated model, but for discrete events rather than page
// loads. Only a fixed set of event types is accepted so this can't be
// used as an open write endpoint.
//
// Body: { type, sessionId, visitorId, meta }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const ALLOWED_TYPES = new Set(["add_to_cart", "checkout_started", "search", "how_heard"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const body = await req.json().catch(() => ({}));
    const type = String(body.type || "");
    if (!ALLOWED_TYPES.has(type)) return json({ ok: true }); // ignore unknown types silently

    const sessionId = String(body.sessionId || "").slice(0, 64) || null;
    const visitorId = String(body.visitorId || "").slice(0, 64) || null;

    // Clamp meta to a small, known shape so this can't be used to store
    // arbitrary blobs. `q` (search term) is truncated; numbers pass through.
    const rawMeta = (body.meta && typeof body.meta === "object") ? body.meta : {};
    const meta: Record<string, unknown> = {};
    if (rawMeta.q != null) meta.q = String(rawMeta.q).slice(0, 120);
    if (rawMeta.id != null) meta.id = String(rawMeta.id).slice(0, 80);
    if (rawMeta.results != null && Number.isFinite(Number(rawMeta.results))) meta.results = Number(rawMeta.results);
    if (rawMeta.price != null && Number.isFinite(Number(rawMeta.price))) meta.price = Number(rawMeta.price);
    if (rawMeta.value != null && Number.isFinite(Number(rawMeta.value))) meta.value = Number(rawMeta.value);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("client_events").insert({ type, session_id: sessionId, visitor_id: visitorId, meta });
    return json({ ok: true });
  } catch (err) {
    console.error("[track-event] error:", err);
    return json({ ok: true }); // never block the page over analytics
  }
});
