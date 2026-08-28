// supabase/functions/admin-youtube-analytics/index.ts
//
// Deploy with:
//   supabase functions deploy admin-youtube-analytics
//
// The OAuth-only half of YouTube stats: watch time, average view
// duration, retention (% viewed), subscribers gained/lost and traffic
// sources - none of which the Data API key can see. Connected via
// /youtube-callback (youtube-oauth-exchange); this rotates the access
// token off the stored refresh token when it 401s.
//
// Returns { ok: true, configured: false } when no OAuth token is set, so
// the Marketing tab shows a "connect" prompt instead of an error.
//
// Body: { days } (default 28 - YT Analytics lags ~2-3 days, so "today"
// isn't meaningful anyway)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshAccessToken } from "../_shared/google_oauth.ts";

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

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

async function report(token: string, params: Record<string, string>): Promise<any | "expired" | null> {
  const url = "https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams(params);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return "expired";
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[admin-youtube-analytics] API error:", res.status, JSON.stringify(body).slice(0, 300));
    return null;
  }
  return body;
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

    let token = Deno.env.get("YOUTUBE_OAUTH_ACCESS_TOKEN");
    if (!token) return json({ ok: true, configured: false });

    const body = await req.json().catch(() => ({}));
    const days = Math.min(365, Math.max(7, Number(body.days) || 28));
    const end = new Date(Date.now() - 2 * 86400000); // ~2-day reporting lag
    const start = new Date(end.getTime() - days * 86400000);
    const base = { ids: "channel==MINE", startDate: ymd(start), endDate: ymd(end) };

    async function run() {
      const overall = await report(token!, { ...base, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost" });
      if (overall === "expired") return "expired" as const;
      const traffic = await report(token!, { ...base, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views", maxResults: "10" });
      return { overall, traffic };
    }

    let result = await run();
    if (result === "expired") {
      const fresh = await refreshAccessToken();
      if (!fresh) return json({ ok: false, configured: true, error: "YouTube session expired - click Connect YouTube Analytics to re-authorise." }, 502);
      token = fresh;
      result = await run();
    }
    if (result === "expired" || !result || !result.overall) {
      return json({ ok: false, error: "Could not reach YouTube Analytics." }, 502);
    }

    const row = result.overall?.rows?.[0] ?? [];
    const watch = {
      views: Number(row[0] ?? 0),
      minutesWatched: Number(row[1] ?? 0),
      avgViewDuration: Number(row[2] ?? 0),      // seconds
      avgViewPercentage: Number(row[3] ?? 0),    // %
      subscribersGained: Number(row[4] ?? 0),
      subscribersLost: Number(row[5] ?? 0),
      days,
    };
    const SOURCE_LABELS: Record<string, string> = {
      ADVERTISING: "Ads", ANNOTATION: "Annotations", CAMPAIGN_CARD: "Cards",
      END_SCREEN: "End screens", EXT_URL: "External", NO_LINK_EMBEDDED: "Embeds",
      NO_LINK_OTHER: "Direct / unknown", NOTIFICATION: "Notifications",
      PLAYLIST: "Playlists", PROMOTED: "Promoted", RELATED_VIDEO: "Suggested videos",
      SHORTS: "Shorts feed", SUBSCRIBER: "Subscriptions feed", YT_CHANNEL: "Channel pages",
      YT_OTHER: "Other YouTube", YT_SEARCH: "YouTube search", HASHTAGS: "Hashtags",
      SOUND_PAGE: "Sound pages", LIVE_REDIRECT: "Live redirect",
    };
    const trafficSources = (result.traffic?.rows ?? []).map((r: any[]) => ({
      source: SOURCE_LABELS[r[0]] || r[0],
      views: Number(r[1] ?? 0),
      minutesWatched: Number(r[2] ?? 0),
    }));

    return json({ ok: true, configured: true, watch, trafficSources });
  } catch (err) {
    console.error("[admin-youtube-analytics] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
