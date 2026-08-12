// supabase/functions/discord-member-snapshot/index.ts
//
// Deploy with:
//   supabase functions deploy discord-member-snapshot --no-verify-jwt
//
// Called on a schedule by pg_cron/pg_net (see discord_snapshot_cron.sql),
// not by an admin loading a page - so the "Discord joins" stat on the admin
// home dashboard keeps accumulating history every day even if nobody opens
// the admin panel that day. Same reasoning and auth pattern as
// roblox-cookie-healthcheck: verifies a shared secret header instead of a
// Supabase user JWT, since this has no human caller to hold a session.
//
// Writes today's member count into discord_member_snapshots (see
// supabase/discord_member_snapshots.sql) - admin-discord-stats also upserts
// this same row when an admin views the dashboard, so the two together mean
// every day gets a snapshot regardless of which one runs first.
//
// Required secret: DISCORD_SNAPSHOT_CRON_SECRET - must match the header
// value the cron job sends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INVITE_CODE = "coldd";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const cronSecret = Deno.env.get("DISCORD_SNAPSHOT_CRON_SECRET");
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
      return json({ ok: false, error: "Unauthorized." }, 401);
    }

    const res = await fetch(`https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true`);
    if (!res.ok) return json({ ok: false, error: "Could not reach Discord." }, 502);
    const data = await res.json();
    const memberCount = data.approximate_member_count ?? null;
    const onlineCount = data.approximate_presence_count ?? null;
    if (memberCount == null) return json({ ok: false, error: "Discord response had no member count." }, 502);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await admin.from("discord_member_snapshots").upsert(
      { snapshot_date: today, member_count: memberCount, online_count: onlineCount },
      { onConflict: "snapshot_date" },
    );
    if (error) {
      console.error("[discord-member-snapshot] upsert failed:", error.message);
      return json({ ok: false, error: "Could not save snapshot." }, 500);
    }

    return json({ ok: true, memberCount, onlineCount });
  } catch (err) {
    console.error("[discord-member-snapshot] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
