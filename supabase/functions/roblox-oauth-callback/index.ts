// supabase/functions/roblox-oauth-callback/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-oauth-callback
//
// Called by roblox-callback.html right after the signed-in user completes
// Roblox's OAuth consent screen. Exchanges the authorization code for
// tokens, reads the Roblox account's id/username, and upserts
// roblox_accounts for the caller. Tokens never leave this function - the
// frontend only ever gets back { ok, linked, robloxUsername }.
//
// Body: { code, redirectUri } to link an account, or { unlink: true } to
// remove an existing link.

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
    const body = await req.json().catch(() => ({}));

    if (body.unlink) {
      const { error: delErr } = await admin.from("roblox_accounts").delete().eq("user_id", userData.user.id);
      if (delErr) return json({ ok: false, error: "Could not unlink your Roblox account." }, 500);
      return json({ ok: true, linked: false });
    }

    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    if (!code || !redirectUri) return json({ ok: false, error: "Missing authorization code." }, 400);

    const clientId = Deno.env.get("ROBLOX_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("ROBLOX_OAUTH_CLIENT_SECRET")!;

    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[roblox-oauth-callback] token exchange failed:", tokenRes.status, tokenData);
      return json({ ok: false, error: "Roblox sign-in failed. Please try again." }, 400);
    }

    const userInfoRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userInfo = await userInfoRes.json().catch(() => ({}));
    const robloxId = String(userInfo.sub || "");
    const robloxUsername = userInfo.preferred_username || userInfo.nickname || userInfo.name || "";
    if (!robloxId) {
      console.error("[roblox-oauth-callback] userinfo missing sub:", userInfoRes.status, userInfo);
      return json({ ok: false, error: "Could not read your Roblox profile." }, 400);
    }

    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

    const { error: upsertErr } = await admin.from("roblox_accounts").upsert({
      user_id: userData.user.id,
      roblox_id: robloxId,
      roblox_username: robloxUsername,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      expires_at: expiresAt,
      linked_at: new Date().toISOString(),
    });
    if (upsertErr) {
      // roblox_id carries its own UNIQUE constraint (one Roblox account
      // can't back two coldd accounts), but this upsert's implicit
      // conflict target is only the primary key (user_id) - so relinking
      // a Roblox account that's already linked to a *different* coldd
      // user throws an ordinary unique_violation (Postgres code 23505)
      // here rather than being handled as the upsert's own conflict path.
      // That's a real, reachable case (anyone testing with one Roblox
      // account across multiple coldd accounts hits it immediately), not
      // an edge case - worth its own message instead of a generic 500.
      if (upsertErr.code === "23505") {
        return json({ ok: false, error: "That Roblox account is already linked to a different coldd account. Unlink it there first." }, 409);
      }
      console.error("[roblox-oauth-callback] upsert failed:", upsertErr.message);
      return json({ ok: false, error: "Could not save your Roblox link." }, 500);
    }

    return json({ ok: true, linked: true, robloxUsername });
  } catch (err) {
    console.error("[roblox-oauth-callback] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
