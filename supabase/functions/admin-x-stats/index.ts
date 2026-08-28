// supabase/functions/admin-x-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-x-stats
//
// Real follower count via X API v2's users/by/username lookup with
// public_metrics. Needs two secrets
// (`supabase secrets set TWITTER_BEARER_TOKEN=... TWITTER_USERNAME=...`):
// an App-only Bearer token from the X developer portal, and the handle
// without the @ (e.g. "ColddDev"). As of the API's current pricing, the
// free tier does not include this endpoint - a paid Basic tier or above
// is required, same caveat given to the user up front.
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

    const bearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    const username = Deno.env.get("TWITTER_USERNAME");
    if (!bearerToken || !username) return json({ ok: true, configured: false });

    const auth = { Authorization: `Bearer ${bearerToken}` };
    const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) {
      console.error("[admin-x-stats] X API error:", res.status, await res.text().catch(() => ""));
      return json({ ok: false, error: "Could not reach X." }, 502);
    }
    const data = await res.json();
    const metrics = data?.data?.public_metrics;
    const userId = data?.data?.id;
    if (!metrics) return json({ ok: false, error: "Account not found." }, 404);

    const followersCount = Number(metrics.followers_count ?? 0);
    const tweetCount = Number(metrics.tweet_count ?? 0);
    const followingCount = Number(metrics.following_count ?? 0);
    const likeCount = Number(metrics.like_count ?? 0);
    const listedCount = Number(metrics.listed_count ?? 0);

    // Recent-tweet engagement. Needs the users/:id/tweets read endpoint,
    // which the paid Basic tier and up allow; on a tier that blocks it the
    // call 403s and we simply omit the engagement block rather than fail
    // the whole stats pull. impression_count in public_metrics is only
    // populated for the authenticated account's own posts - which is
    // exactly this case - but can lag or read 0, so the rate is only
    // reported when impressions are actually present.
    let engagement: Record<string, number> | null = null;
    let latestPostAt: string | null = null;
    if (userId) {
      try {
        const tRes = await fetch(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&exclude=retweets,replies&tweet.fields=public_metrics,created_at`,
          { headers: auth },
        );
        if (tRes.ok) {
          const tJson = await tRes.json();
          const tweets: any[] = Array.isArray(tJson?.data) ? tJson.data : [];
          if (tweets.length) {
            let imp = 0, likes = 0, rts = 0, replies = 0, quotes = 0, bookmarks = 0;
            for (const tw of tweets) {
              if (tw.created_at && (!latestPostAt || tw.created_at > latestPostAt)) latestPostAt = tw.created_at;
              const m = tw.public_metrics ?? {};
              imp += Number(m.impression_count ?? 0);
              likes += Number(m.like_count ?? 0);
              rts += Number(m.retweet_count ?? 0);
              replies += Number(m.reply_count ?? 0);
              quotes += Number(m.quote_count ?? 0);
              bookmarks += Number(m.bookmark_count ?? 0);
            }
            const interactions = likes + rts + replies + quotes;
            engagement = {
              sampleSize: tweets.length,
              impressions: imp,
              likes,
              retweets: rts,
              replies,
              quotes,
              bookmarks,
              interactions,
              avgImpressionsPerPost: Math.round(imp / tweets.length),
              avgInteractionsPerPost: Math.round((interactions / tweets.length) * 10) / 10,
              engagementRate: imp > 0 ? Math.round((interactions / imp) * 10000) / 100 : null,
            } as Record<string, number>;
          }
        } else {
          console.warn("[admin-x-stats] tweets endpoint unavailable:", tRes.status);
        }
      } catch (e) {
        console.warn("[admin-x-stats] engagement fetch failed:", e);
      }
    }

    const extra: Record<string, unknown> = { tweetCount, followingCount, likeCount, listedCount };
    if (engagement) {
      extra.recentImpressions = engagement.impressions;
      extra.recentInteractions = engagement.interactions;
      extra.engagementRate = engagement.engagementRate;
    }
    await upsertSocialSnapshot(admin, "x", followersCount, extra);
    const history = await getSocialHistory(admin, "x");

    return json({ ok: true, configured: true, followersCount, tweetCount, followingCount, likeCount, listedCount, latestPostAt, engagement, history });
  } catch (err) {
    console.error("[admin-x-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
