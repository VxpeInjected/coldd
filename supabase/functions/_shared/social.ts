// supabase/functions/_shared/social.ts
//
// Shared by admin-youtube-stats/admin-x-stats/admin-tiktok-stats: each
// platform's follower count only ever tells you "right now", so a daily
// snapshot table (social_media_stats) is what lets the Marketing tab show
// a trend. Same pattern as discord_member_snapshots, generalized across
// platforms instead of one dedicated table per platform.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function upsertSocialSnapshot(
  admin: SupabaseClient,
  platform: string,
  followers: number | null,
  extra: Record<string, unknown> | null = null,
) {
  if (followers == null) return;
  const today = new Date().toISOString().slice(0, 10);
  await admin.from("social_media_stats").upsert(
    { platform, snapshot_date: today, followers, extra },
    { onConflict: "platform,snapshot_date" },
  );
}

export async function getSocialHistory(admin: SupabaseClient, platform: string) {
  // Returns the `extra` blob alongside followers so the dashboard can chart
  // trends for the richer per-platform metrics (posts, views, likes, …),
  // not just the follower line. Older callers that only read
  // {snapshot_date, followers} keep working unchanged.
  const { data } = await admin
    .from("social_media_stats")
    .select("snapshot_date, followers, extra")
    .eq("platform", platform)
    .order("snapshot_date", { ascending: true })
    .limit(400);
  return data ?? [];
}
