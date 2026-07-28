// supabase/functions/roblox-signin/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-signin
//
// Primary "Sign in with Roblox" - unlike roblox-oauth-callback (which
// links Roblox to an ALREADY signed-in coldd account), this creates or
// signs into a coldd account directly from a Roblox identity. No
// Authorization header is required.
//
// Roblox isn't a Supabase Auth provider, so there's no native session
// exchange - this bridges in via the documented magic-link pattern:
// generate an OTP for the account's Auth email via the Admin API (which
// does not send anything itself) and hand it back to the client to
// redeem with supabase.auth.verifyOtp(). New users get a synthetic,
// undeliverable @roblox.coldd.internal address used purely as their
// Supabase Auth identifier - Roblox accounts frequently have no
// verified email at all.
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
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
      console.error("[roblox-signin] token exchange failed:", tokenRes.status, tokenData);
      return json({ ok: false, error: "Roblox sign-in failed. Please try again." }, 400);
    }

    const userInfoRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userInfo = await userInfoRes.json().catch(() => ({}));
    const robloxId = String(userInfo.sub || "");
    const robloxUsername = userInfo.preferred_username || userInfo.nickname || userInfo.name || "Roblox User";
    const avatar = userInfo.picture || "";
    if (!robloxId) {
      console.error("[roblox-signin] userinfo missing sub:", userInfoRes.status, userInfo);
      return json({ ok: false, error: "Could not read your Roblox profile." }, 400);
    }

    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

    // Already linked to a coldd account (e.g. linked from the dashboard,
    // now signing in on a fresh device) - sign that same account back in
    // rather than creating a duplicate.
    const { data: existingLink } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("roblox_id", robloxId)
      .maybeSingle();

    let userId: string;
    let email: string;

    if (existingLink) {
      userId = existingLink.user_id;
      const { data: userRes, error: getUserErr } = await admin.auth.admin.getUserById(userId);
      if (getUserErr || !userRes?.user?.email) {
        console.error("[roblox-signin] could not load existing user:", getUserErr);
        return json({ ok: false, error: "Could not sign you in. Please try again." }, 500);
      }
      email = userRes.user.email;
    } else {
      email = "roblox-" + robloxId + "@roblox.coldd.internal";
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { roblox_id: robloxId, username: robloxUsername, avatar_url: avatar, provider: "roblox" },
      });
      if (createErr || !created?.user) {
        console.error("[roblox-signin] createUser failed:", createErr);
        return json({ ok: false, error: "Could not create your account. Please try again." }, 500);
      }
      userId = created.user.id;

      const { error: profileErr } = await admin.from("profiles").upsert({
        id: userId,
        roblox_id: robloxId,
        username: robloxUsername,
        email: email,
        avatar_url: avatar,
        updated_at: new Date().toISOString(),
      });
      if (profileErr) console.warn("[roblox-signin] profile upsert failed:", profileErr.message);
    }

    const { error: linkErr } = await admin.from("roblox_accounts").upsert({
      user_id: userId,
      roblox_id: robloxId,
      roblox_username: robloxUsername,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      expires_at: expiresAt,
      linked_at: new Date().toISOString(),
    });
    if (linkErr) console.warn("[roblox-signin] roblox_accounts upsert failed:", linkErr.message);

    const { data: linkData, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const otp = linkData?.properties?.email_otp;
    if (genErr || !otp) {
      console.error("[roblox-signin] generateLink failed:", genErr, linkData);
      return json({ ok: false, error: "Could not finish signing you in. Please try again." }, 500);
    }

    return json({ ok: true, email, otp, robloxUsername, avatarUrl: avatar });
  } catch (err) {
    console.error("[roblox-signin] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
