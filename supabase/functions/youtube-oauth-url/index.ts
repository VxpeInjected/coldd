// supabase/functions/youtube-oauth-url/index.ts
//
// Deploy with:
//   supabase functions deploy youtube-oauth-url
//
// Admin-gated. Returns the Google OAuth consent URL for connecting the
// YouTube Analytics API, built from the YOUTUBE_OAUTH_CLIENT_ID secret so
// the client id never has to be hard-coded in admin.js. The admin panel
// fetches this and redirects the browser to it.
//
// Body: { redirectUri }

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

    const clientId = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID");
    if (!clientId) return json({ ok: false, error: "YOUTUBE_OAUTH_CLIENT_ID secret is not set." }, 400);

    const body = await req.json().catch(() => ({}));
    const redirectUri = String(body.redirectUri || "https://coldd.dev/youtube-callback");

    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/yt-analytics.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
    return json({ ok: true, url });
  } catch (err) {
    console.error("[youtube-oauth-url] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
