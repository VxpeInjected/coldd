// supabase/functions/admin-discord-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-discord-stats
//
// Real Discord member/online counts via the public invite-lookup endpoint
// (discord.com/api/invites/{code}?with_counts=true) - no bot token needed,
// works for any invite as long as the server has "Enable widget" or just
// a standing invite link, which coldd already has (discord.gg/coldd).
//
// Also upserts today's count into discord_member_snapshots (one row per UTC
// day) and returns recent history, so the admin dashboard can show net
// members gained/lost over a selected period. That endpoint has no history
// of its own - only ever the current count - so this is the only way to
// build a trend, and it can only start from whenever this first ran.
//
// Body: {} (auth only - is_admin gated like the other admin-* functions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";
const INVITE_CODE = "coldd";

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

    const res = await fetch(`https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true`);
    if (!res.ok) return json({ ok: false, error: "Could not reach Discord." }, 502);
    const data = await res.json();
    const memberCount = data.approximate_member_count ?? null;
    const onlineCount = data.approximate_presence_count ?? null;

    if (memberCount != null) {
      const today = new Date().toISOString().slice(0, 10);
      // Upsert, not insert - repeated loads on the same day must not create
      // duplicate rows or overwrite an earlier, more representative reading
      // with a random later one; last write wins, which is fine for a daily
      // granularity trend.
      await admin.from("discord_member_snapshots").upsert(
        { snapshot_date: today, member_count: memberCount, online_count: onlineCount },
        { onConflict: "snapshot_date" },
      );
    }

    const { data: history } = await admin
      .from("discord_member_snapshots")
      .select("snapshot_date, member_count, online_count")
      .order("snapshot_date", { ascending: true })
      .limit(400);

    return json({
      ok: true,
      memberCount,
      onlineCount,
      history: history ?? [],
    });
  } catch (err) {
    console.error("[admin-discord-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
