// supabase/functions/admin-tiktok-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-tiktok-stats
//
// TikTok has no plain-API-key stats endpoint like YouTube/X - the Display
// API is OAuth-per-account, so this needs a real user access token
// obtained by completing TikTok's OAuth flow for the coldd account once
// (via an approved TikTok developer app), then storing the resulting
// token as a secret: `supabase secrets set TIKTOK_ACCESS_TOKEN=...`.
// TikTok access tokens are short-lived (~24h) and rotate via a refresh
// token - this function does NOT handle that rotation, so the secret
// will need manually refreshing when it expires. That's a real gap, not
// hidden: automating the refresh is a follow-up once the initial token
// is in hand and the exact expiry behavior can be observed live, per the
// same "don't trust docs, verify against the real API" lesson learned
// from AdBlox's docs being wrong twice.
//
// Returns { ok: true, configured: false } rather than an error when the
// secret isn't set yet, so the Marketing tab can show a clean
// "not connected" state instead of a red error banner.
//
// Body: {} (auth only - is_admin gated like the other admin-* functions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertSocialSnapshot, getSocialHistory } from "../_shared/social.ts";

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

    const accessToken = Deno.env.get("TIKTOK_ACCESS_TOKEN");
    if (!accessToken) return json({ ok: true, configured: false });

    const url = "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.error("[admin-tiktok-stats] TikTok API error:", res.status, await res.text().catch(() => ""));
      // A stale/expired token is the most likely real-world failure here -
      // say so plainly rather than a generic "could not reach" message,
      // since the fix (re-run OAuth, update the secret) is different.
      return json({ ok: false, error: "Could not reach TikTok - the access token may have expired and need refreshing." }, 502);
    }
    const data = await res.json();
    const info = data?.data?.user;
    if (!info) return json({ ok: false, error: "Account not found." }, 404);

    const followerCount = Number(info.follower_count ?? 0);
    const likesCount = Number(info.likes_count ?? 0);
    const videoCount = Number(info.video_count ?? 0);

    await upsertSocialSnapshot(admin, "tiktok", followerCount, { likesCount, videoCount });
    const history = await getSocialHistory(admin, "tiktok");

    return json({ ok: true, configured: true, followerCount, likesCount, videoCount, history });
  } catch (err) {
    console.error("[admin-tiktok-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
