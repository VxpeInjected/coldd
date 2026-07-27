// supabase/functions/lock-check/index.ts
//
// Verifies the pre-launch lock-screen password server-side, so the real
// password never ships in client-visible source (unlike the old lock.html,
// which had it in plain JS).
//
// Deploy with:
//   supabase functions deploy lock-check --no-verify-jwt
//
// Required secret (set once):
//   supabase secrets set LOCK_PASSWORD=coldd.Developers.8283
//
// --no-verify-jwt is intentional: this runs before any session exists,
// there is nothing to verify a JWT against yet.

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
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
    const body = await req.json().catch(() => ({}));
    const guess = typeof body.password === "string" ? body.password : "";
    const correct = Deno.env.get("LOCK_PASSWORD") || "";
    const ok = guess.length > 0 && correct.length > 0 && guess === correct;
    return json({ ok });
  } catch (err) {
    console.error("[lock-check] error:", err);
    return json({ ok: false }, 500);
  }
});
