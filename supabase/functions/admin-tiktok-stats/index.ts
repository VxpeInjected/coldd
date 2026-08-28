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

    const bearer = { Authorization: `Bearer ${accessToken}` };
    const url = "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count";
    const res = await fetch(url, { headers: bearer });
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
    const lifetimeLikesPerVideo = videoCount > 0 ? Math.round((likesCount / videoCount) * 10) / 10 : 0;

    // Per-video engagement via the Display API's video/list. Needs the
    // extra `video.list` OAuth scope (the authorize URL in admin.js
    // requests it) - if the stored token predates that scope the call
    // returns scope_not_authorized and we just skip the engagement block.
    let engagement: Record<string, number | null> | null = null;
    try {
      const vRes = await fetch(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,like_count,comment_count,share_count,view_count",
        { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20 }) },
      );
      if (vRes.ok) {
        const vJson = await vRes.json();
        const vids: any[] = vJson?.data?.videos ?? [];
        if (vids.length) {
          let views = 0, likes = 0, comments = 0, shares = 0;
          for (const v of vids) {
            views += Number(v.view_count ?? 0);
            likes += Number(v.like_count ?? 0);
            comments += Number(v.comment_count ?? 0);
            shares += Number(v.share_count ?? 0);
          }
          const interactions = likes + comments + shares;
          engagement = {
            sampleSize: vids.length,
            views,
            likes,
            comments,
            shares,
            interactions,
            avgViewsPerVideo: Math.round(views / vids.length),
            avgLikesPerVideo: Math.round((likes / vids.length) * 10) / 10,
            engagementRate: views > 0 ? Math.round((interactions / views) * 10000) / 100 : null,
          };
        }
      } else {
        console.warn("[admin-tiktok-stats] video/list unavailable:", vRes.status, await vRes.text().catch(() => ""));
      }
    } catch (e) {
      console.warn("[admin-tiktok-stats] engagement fetch failed:", e);
    }

    const extra: Record<string, unknown> = { likesCount, videoCount, lifetimeLikesPerVideo };
    if (engagement) {
      extra.recentViews = engagement.views;
      extra.recentInteractions = engagement.interactions;
      extra.engagementRate = engagement.engagementRate;
    }
    await upsertSocialSnapshot(admin, "tiktok", followerCount, extra);
    const history = await getSocialHistory(admin, "tiktok");

    return json({ ok: true, configured: true, followerCount, likesCount, videoCount, lifetimeLikesPerVideo, engagement, history });
  } catch (err) {
    console.error("[admin-tiktok-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
