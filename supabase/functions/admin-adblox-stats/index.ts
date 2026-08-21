// supabase/functions/admin-adblox-stats/index.ts
//
// Deploy with:
//   supabase functions deploy admin-adblox-stats
//
// Pulls Discord-ad stats from AdBlox for the admin Marketing panel's
// "Advertisements" card.
//
// docs.adblox.xyz/get-statistics describes a { data: { sends, joins, meta } }
// shape and calls it an "unreleased v2 feature". The LIVE endpoint (verified
// directly against the real API, not assumed from the docs) currently
// returns something else entirely - no wrapper object, no "joins" at all:
//
//   { sent: {...}, failed: {...}, skipped: {...}, totals: {...},
//     generated_at, timezone }
//
// where sent/failed/skipped each have today/yesterday/last_7d/last_30d/
// all_time. This function passes that real shape through as-is rather than
// reshaping it to match the (currently inaccurate) docs - if AdBlox ships v2
// later and the response gains a "joins" object, this will need updating
// then, not now.
//
// Also pulls the top-servers breakdown (/api/v1/servers) and a page of the
// send-by-send audit log (/api/v1/logs) - both verified directly against the
// live API the same way, not from docs.
//
// Fails soft (ok:false with a clear message) rather than throwing on a
// non-2xx or unexpected shape, same pattern as every other third-party stat
// source in this codebase (Discord invite lookup, Roblox fallback cookie).
// The three calls are independent of each other - a failure on one (e.g. an
// empty logs page) doesn't block the other two from returning.
//
// Body: { logCursor?: string } - logCursor pages the audit log forward
// (pass back the previous response's nextLogCursor); omit for the first page.

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

    const apiKey = Deno.env.get("ADBLOX_API_KEY");
    if (!apiKey) return json({ ok: false, error: "ADBLOX_API_KEY is not set." }, 500);

    const body = await req.json().catch(() => ({}));
    const logCursor = typeof body.logCursor === "string" ? body.logCursor : "";

    const authHeaders = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const [statsRes, serversRes, logsRes] = await Promise.all([
      fetch("https://adblox.xyz/api/v1/stats", { headers: authHeaders }),
      fetch("https://adblox.xyz/api/v1/servers?days=30&limit=50", { headers: authHeaders }),
      fetch(`https://adblox.xyz/api/v1/logs?status=sent&limit=50&cursor=${encodeURIComponent(logCursor)}`, { headers: authHeaders }),
    ]);

    if (!statsRes.ok) {
      const bodyText = await statsRes.text().catch(() => "");
      console.error("[admin-adblox-stats] /stats returned", statsRes.status, bodyText.slice(0, 300));
      // Surfaced distinctly so the client can back off its auto-refresh
      // interval instead of treating this the same as any other failure
      // and hammering the API again 15/30s later regardless.
      if (statsRes.status === 429) {
        return json({ ok: false, error: "AdBlox rate limit hit - will retry automatically.", rateLimited: true }, 429);
      }
      return json({ ok: false, error: `AdBlox returned HTTP ${statsRes.status}.` }, 502);
    }
    const data = await statsRes.json().catch(() => null);
    if (!data || !data.sent) {
      return json({ ok: false, error: "AdBlox response was not in the expected shape." }, 502);
    }

    // Servers/logs are supplementary - a hiccup on either still returns the
    // headline stats rather than failing the whole request.
    let servers: unknown[] = [];
    if (serversRes.ok) {
      const serversData = await serversRes.json().catch(() => null);
      servers = Array.isArray(serversData?.servers) ? serversData.servers : [];
    } else {
      console.error("[admin-adblox-stats] /servers returned", serversRes.status);
    }

    let logs: unknown[] = [];
    let nextLogCursor: string | null = null;
    if (logsRes.ok) {
      const logsData = await logsRes.json().catch(() => null);
      logs = Array.isArray(logsData?.logs) ? logsData.logs : [];
      nextLogCursor = logsData?.next_cursor ?? null;
    } else {
      console.error("[admin-adblox-stats] /logs returned", logsRes.status);
    }

    return json({
      ok: true,
      sent: data.sent,
      failed: data.failed ?? null,
      skipped: data.skipped ?? null,
      totals: data.totals ?? null,
      generatedAt: data.generated_at ?? null,
      servers: servers,
      logs: logs,
      nextLogCursor: nextLogCursor,
    });
  } catch (err) {
    console.error("[admin-adblox-stats] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
