// supabase/functions/tiktok-oauth-exchange/index.ts
//
// Deploy with:
//   supabase functions deploy tiktok-oauth-exchange
//
// Same auth/is_admin gate as the other admin-* functions (this one just
// isn't named admin-* since it's specifically the TikTok OAuth step, not
// a general admin action). TikTok's Login Kit isn't a Supabase Auth
// provider, so this is a hand-rolled authorization-code exchange:
// /tiktok-callback.html sends the ?code TikTok redirected back with,
// this function trades it for an access token server-side (the client
// secret must never reach the browser), and returns the token to the
// caller for one-time display - it is NOT persisted anywhere. The admin
// copies it and it gets set as the TIKTOK_ACCESS_TOKEN secret by hand.
//
// Body: { code, redirectUri }

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
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
    if (!clientKey || !clientSecret) return json({ ok: false, error: "TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET secrets are not set yet." }, 400);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    if (!code || !redirectUri) return json({ ok: false, error: "Missing code or redirectUri." }, 400);

    const params = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error("[tiktok-oauth-exchange] TikTok token error:", res.status, JSON.stringify(data));
      return json({ ok: false, error: data.error_description || data.error || "TikTok rejected the exchange." }, 502);
    }

    return json({
      ok: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      openId: data.open_id,
      scope: data.scope,
    });
  } catch (err) {
    console.error("[tiktok-oauth-exchange] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
