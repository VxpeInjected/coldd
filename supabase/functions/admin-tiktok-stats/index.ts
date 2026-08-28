// supabase/functions/admin-tiktok-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-tiktok-stats
//
// TikTok has no plain-API-key stats endpoint like YouTube/X - the Display
// API is OAuth-per-account, so the initial token comes from completing
// TikTok's OAuth flow once (Connect TikTok -> tiktok-oauth-exchange),
// which stores TIKTOK_ACCESS_TOKEN + TIKTOK_REFRESH_TOKEN as secrets.
//
// Access tokens last ~24h. This function auto-rotates them: on an
// expired-token response it exchanges TIKTOK_REFRESH_TOKEN for a fresh
// pair, writes both back via the Supabase Management API (needs
// MANAGEMENT_API_TOKEN, same as the exchange function), and retries once.
// The refresh token itself rotates on each use and lasts ~1yr, so once
// connected TikTok stays live without anyone re-authorizing - until the
// refresh token expires or the app authorization is revoked, at which
// point the function asks for a reconnect.
//
// Returns { ok: true, configured: false } when no token is set yet, so
// the Marketing tab shows a clean "not connected" state, not a red error.
//
// Body: {} (auth only - is_admin gated like the other admin-* functions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertSocialSnapshot, getSocialHistory } from "../_shared/social.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";

// Trades the stored refresh token for a fresh access/refresh pair and
// persists both as project secrets. Returns the new access token, or null
// if anything needed is missing or TikTok rejects the refresh (expired /
// revoked - a full reconnect is the only fix then).
async function refreshTikTokAccessToken(): Promise<string | null> {
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  const refreshToken = Deno.env.get("TIKTOK_REFRESH_TOKEN");
  const mgmtToken = Deno.env.get("MANAGEMENT_API_TOKEN");
  if (!clientKey || !clientSecret || !refreshToken || !mgmtToken) {
    console.error("[admin-tiktok-stats] cannot refresh - missing client/refresh/management secret");
    return null;
  }

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    console.error("[admin-tiktok-stats] refresh rejected:", res.status, JSON.stringify(data));
    return null;
  }

  const projectRef = new URL(Deno.env.get("SUPABASE_URL")!).hostname.split(".")[0];
  const secretsRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      { name: "TIKTOK_ACCESS_TOKEN", value: data.access_token },
      { name: "TIKTOK_REFRESH_TOKEN", value: data.refresh_token || refreshToken },
    ]),
  });
  if (!secretsRes.ok) {
    console.error("[admin-tiktok-stats] failed to persist rotated tokens:", secretsRes.status, await secretsRes.text().catch(() => ""));
    // The in-memory token is still good for this request even if the
    // write failed, so return it - next invocation just refreshes again.
  }
  return data.access_token as string;
}

// GET/POST a TikTok Display API endpoint. Returns the parsed body, or the
// string "expired" when the access token is stale (so the caller can
// refresh and retry), or null on any other failure.
async function tiktokCall(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<any | "expired" | null> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || body?.error?.code === "access_token_invalid" || body?.error?.code === "access_token_expired") {
    return "expired";
  }
  if (!res.ok || body?.error?.code) {
    console.error("[admin-tiktok-stats] TikTok API error:", res.status, JSON.stringify(body?.error ?? body).slice(0, 300));
    return null;
  }
  return body;
}

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

    let accessToken = Deno.env.get("TIKTOK_ACCESS_TOKEN");
    if (!accessToken) return json({ ok: true, configured: false });

    const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count";

    let data = await tiktokCall(USER_INFO_URL, accessToken);
    if (data === "expired") {
      const fresh = await refreshTikTokAccessToken();
      if (!fresh) {
        return json({
          ok: false,
          configured: true,
          error: "TikTok session expired and couldn't be refreshed automatically - click Connect TikTok to re-authorize.",
        }, 502);
      }
      accessToken = fresh;
      data = await tiktokCall(USER_INFO_URL, accessToken);
    }
    if (data === "expired" || data == null) {
      return json({ ok: false, error: "Could not reach TikTok." }, 502);
    }
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
    let recentVideos: Array<Record<string, unknown>> = [];
    let latestPostAt: string | null = null;
    try {
      const vJson = await tiktokCall(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,like_count,comment_count,share_count,view_count",
        accessToken,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20 }) },
      );
      if (vJson && vJson !== "expired") {
        const vids: any[] = vJson?.data?.videos ?? [];
        if (vids.length) {
          let views = 0, likes = 0, comments = 0, shares = 0;
          for (const v of vids) {
            const vViews = Number(v.view_count ?? 0);
            const vLikes = Number(v.like_count ?? 0);
            const vComments = Number(v.comment_count ?? 0);
            const vShares = Number(v.share_count ?? 0);
            views += vViews; likes += vLikes; comments += vComments; shares += vShares;
            const posted = v.create_time ? new Date(v.create_time * 1000).toISOString() : null;
            if (posted && (!latestPostAt || posted > latestPostAt)) latestPostAt = posted;
            recentVideos.push({ id: v.id, title: v.title ?? "", postedAt: posted, views: vViews, likes: vLikes, comments: vComments, shares: vShares });
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

    return json({ ok: true, configured: true, followerCount, likesCount, videoCount, lifetimeLikesPerVideo, latestPostAt, engagement, recentVideos, history });
  } catch (err) {
    console.error("[admin-tiktok-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
