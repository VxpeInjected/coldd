// supabase/functions/youtube-oauth-exchange/index.ts
//
// Deploy with:
//   supabase functions deploy youtube-oauth-exchange
//
// Admin-gated. /youtube-callback.html sends the ?code Google redirected
// back with; this trades it for an access/refresh token pair server-side
// (the client secret never reaches the browser) and writes both into
// YOUTUBE_OAUTH_ACCESS_TOKEN / YOUTUBE_OAUTH_REFRESH_TOKEN via the
// Supabase Management API. Needs YOUTUBE_OAUTH_CLIENT_ID,
// YOUTUBE_OAUTH_CLIENT_SECRET and MANAGEMENT_API_TOKEN set.
//
// Body: { code, redirectUri }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeCode, persistSecrets } from "../_shared/google_oauth.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
    if (!profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    if (!code || !redirectUri) return json({ ok: false, error: "Missing code or redirectUri." }, 400);

    const ex = await exchangeCode(code, redirectUri);
    if (!ex.ok) return json({ ok: false, error: ex.error }, 502);
    if (!ex.refreshToken) {
      return json({ ok: false, error: "Google did not return a refresh token. Remove coldd's access at myaccount.google.com/permissions and try Connect again so the consent prompt reappears." }, 400);
    }

    if (!Deno.env.get("MANAGEMENT_API_TOKEN")) {
      return json({ ok: false, error: "MANAGEMENT_API_TOKEN secret is not set - can't save the token." }, 400);
    }
    const saved = await persistSecrets({
      YOUTUBE_OAUTH_ACCESS_TOKEN: ex.accessToken,
      YOUTUBE_OAUTH_REFRESH_TOKEN: ex.refreshToken,
    });
    if (!saved) return json({ ok: false, error: "Authorised, but saving the token as a secret failed. Check function logs." }, 502);

    return json({ ok: true });
  } catch (err) {
    console.error("[youtube-oauth-exchange] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
