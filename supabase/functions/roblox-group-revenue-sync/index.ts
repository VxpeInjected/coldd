// supabase/functions/roblox-group-revenue-sync/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-group-revenue-sync --no-verify-jwt
//
// Disabled - the cross-platform Robux revenue tracking feature this
// function backed was pulled from the admin UI (unreliable numbers,
// several data-integrity issues while building it out - PostgREST's
// default 1000-row select cap silently truncating rollups, Roblox rate
// limiting, double-counted synthetic orders). Left deployed but inert
// rather than deleted, in case the underlying idea gets revisited later;
// the roblox_group_revenue/roblox_group_transactions tables and
// whatever data they hold are untouched.

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  return json({ ok: true, skipped: true, error: "This feature has been disabled." });
});
