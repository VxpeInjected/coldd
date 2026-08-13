// supabase/functions/admin-youtube-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-youtube-stats
//
// Real subscriber/view counts via the YouTube Data API v3 channels.list
// endpoint (public statistics, no OAuth needed - just an API key). Needs
// two secrets set (`supabase secrets set YOUTUBE_API_KEY=... YOUTUBE_CHANNEL_ID=...`):
// a Data API key from Google Cloud Console, and the channel's ID (the
// UC... string, not the @handle - found via the channel's "About" page
// or the API's forHandle lookup).
//
// Returns { ok: true, configured: false } rather than an error when the
// secrets aren't set yet, so the Marketing tab can show a clean
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

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    const channelId = Deno.env.get("YOUTUBE_CHANNEL_ID");
    if (!apiKey || !channelId) return json({ ok: true, configured: false });

    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[admin-youtube-stats] YouTube API error:", res.status, await res.text().catch(() => ""));
      return json({ ok: false, error: "Could not reach YouTube." }, 502);
    }
    const data = await res.json();
    const stats = data?.items?.[0]?.statistics;
    if (!stats) return json({ ok: false, error: "Channel not found." }, 404);

    const subscriberCount = stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount ?? 0);
    const viewCount = Number(stats.viewCount ?? 0);
    const videoCount = Number(stats.videoCount ?? 0);

    await upsertSocialSnapshot(admin, "youtube", subscriberCount, { viewCount, videoCount });
    const history = await getSocialHistory(admin, "youtube");

    return json({ ok: true, configured: true, subscriberCount, viewCount, videoCount, history });
  } catch (err) {
    console.error("[admin-youtube-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
