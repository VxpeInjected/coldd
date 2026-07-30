// supabase/functions/roblox-group-revenue-sync/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-group-revenue-sync --no-verify-jwt
//
// Scans the group's recent Sale transactions (same cookie-authenticated
// economy.roblox.com endpoint the Phase D purchase-verification fallback
// uses) and records real totals:
//   - total_robux: every Sale transaction in the group ledger - this is
//     the ground truth "Overall Robux revenue" figure, a superset of our
//     own tracked website orders (which pay into the same group).
//   - parcel_robux: the subset of those sales that happened in the
//     separate Parcel Hub game (place id 6156094414, not one of our own
//     products) - logged as synthetic `orders` rows (source='parcel') so
//     they show up in the admin Orders panel too.
//
// Each individual transaction is recorded once in
// roblox_group_transactions (primary key = Roblox's own transaction id,
// insert ... on conflict do nothing), and total_robux/parcel_robux are a
// SUM() rollup over that ledger - not a hand-maintained running counter.
// This makes re-running the sync (rate-limited retries, cron overlapping
// a manual "Sync now", etc.) always safe: re-processing an already-seen
// transaction is a harmless no-op instead of adding its amount again.
//
// Bootstrapping (first run, or catching up after a long gap) can need
// more pages than fit in one rate-limit-safe call, so resume_cursor
// persists Roblox's own pagination cursor across calls - each call picks
// up deeper into history exactly where the last one left off, rather
// than restarting from page 1 and re-walking the same recent pages.
// last_transaction_id only advances once a call actually reaches either
// the previous last_transaction_id or the true end of the group's
// history, marking a confirmed-complete, gap-free scan.
//
// Callable either by the cron job (roblox_group_revenue_cron.sql, shared
// ROBLOX_CRON_SECRET header) or an is_admin user (manual "Sync now").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRobloxCookieBroken } from "../_shared/roblox.ts";

const PARCEL_PLACE_ID = "6156094414";
// Kept small on purpose: the platform's execution time limit means a call
// that tries to walk too many pages (especially with 429 retries) risks
// timing out before it can even return a response and save progress.
// resume_cursor makes repeated smaller calls just as effective as one
// large one.
const MAX_PAGES = 15;

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cronSecret = Deno.env.get("ROBLOX_CRON_SECRET");
    const gotCronSecret = cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!gotCronSecret) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized." }, 401);
      const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
      if (!profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);
    }

    const cookie = Deno.env.get("ROBLOX_FALLBACK_COOKIE");
    const groupId = Deno.env.get("ROBLOX_GROUP_ID");
    if (!cookie || !groupId) return json({ ok: true, skipped: true, error: "Fallback cookie/group id not configured yet." });

    const { data: state } = await admin.from("roblox_group_revenue").select("*").eq("id", true).maybeSingle();
    const lastSeenId: string | null = state?.last_transaction_id || null;

    // deno-lint-ignore no-explicit-any
    const ledgerRows: any[] = [];
    // Temporary diagnostic: sum of amounts per source place/experience this
    // call scanned, so it's verifiable whether unrelated group activity
    // (not the storefront) is inflating the total. Remove once confirmed.
    const placeBreakdown: Record<string, number> = {};
    let newestId: string | null = null;
    let cursor: string | undefined = state?.resume_cursor || undefined;
    let stop = false;
    let pages = 0;
    let rateLimited = false;
    let reachedEnd = false;

    while (!stop && pages < MAX_PAGES) {
      let url = `https://economy.roblox.com/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100&sortOrder=Desc`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      // Roblox's economy API is tightly rate-limited. Only 2 quick retries
      // here - if it's still 429 after that, better to stop and let
      // resume_cursor pick up on the next call than burn the function's
      // execution time budget retrying a page that isn't clearing up.
      let res: Response;
      let attempt = 0;
      for (;;) {
        res = await fetch(url, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
        if (res.status !== 429 || attempt >= 2) break;
        attempt++;
        const retryAfter = Number(res.headers.get("Retry-After"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * attempt);
      }

      if (res.status === 401 || res.status === 403) {
        await notifyRobloxCookieBroken(`Group revenue sync got HTTP ${res.status} - the fallback cookie is likely expired.`);
        return json({ ok: false, error: "Fallback cookie rejected." }, 502);
      }
      if (res.status === 429) {
        // Still rate limited after retrying - stop here. resume_cursor
        // (saved below) means the next call continues from exactly this
        // point instead of re-walking pages already processed.
        rateLimited = true;
        break;
      }
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        console.error("[roblox-group-revenue-sync] transactions fetch failed:", res.status, bodyText.slice(0, 500));
        return json({ ok: false, error: "Could not fetch group transactions (HTTP " + res.status + "): " + bodyText.slice(0, 300) }, 502);
      }

      const data = await res.json().catch(() => ({}));
      // deno-lint-ignore no-explicit-any
      const rows: any[] = data.data || [];
      if (!rows.length) { reachedEnd = true; break; }

      for (const row of rows) {
        // Roblox's transaction "id" field is always 0 on this endpoint -
        // idHash is the real unique identifier per transaction.
        const txId = String(row.idHash || row.purchaseToken || row.id);
        if (txId === lastSeenId) { stop = true; break; }
        if (!newestId) newestId = txId;

        const placeId = row.details?.place?.universeId != null ? String(row.details.place.universeId) : null;
        const placeName = row.details?.place?.name ? String(row.details.place.name) : (placeId || "unknown");
        const placeKey = placeName + " (" + (placeId || "no place id") + ")";
        const amt = Number(row.currency?.amount || 0);
        placeBreakdown[placeKey] = (placeBreakdown[placeKey] || 0) + amt;
        ledgerRows.push({
          id: txId,
          amount: amt,
          is_parcel: placeId === PARCEL_PLACE_ID,
          item_name: row.details?.name ? String(row.details.name) : null,
          created_at: row.created || new Date().toISOString(),
        });
      }

      cursor = data.nextPageCursor || undefined;
      pages++;
      if (!cursor) { reachedEnd = true; break; }
      if (!stop) await sleep(1200);
    }

    // Record every transaction seen this call - on conflict do nothing
    // means re-processing an already-seen id (overlap between runs,
    // retries, cron vs manual) never double-counts it.
    if (ledgerRows.length) {
      const { error: insertErr } = await admin.from("roblox_group_transactions").upsert(ledgerRows, { onConflict: "id", ignoreDuplicates: true });
      if (insertErr) console.error("[roblox-group-revenue-sync] ledger insert failed:", insertErr.message);
    }

    // Rollup is always a fresh SUM() over the ledger, never a running
    // counter - so it's correct regardless of how much overlap occurred.
    const { data: rollup } = await admin
      .from("roblox_group_transactions")
      .select("amount, is_parcel");
    const totalRobux = (rollup || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
    const parcelRobux = (rollup || []).reduce((s: number, r: { amount: number; is_parcel: boolean }) => s + (r.is_parcel ? Number(r.amount || 0) : 0), 0);

    const complete = reachedEnd || stop;
    await admin.from("roblox_group_revenue").upsert({
      id: true,
      total_robux: totalRobux,
      parcel_robux: parcelRobux,
      last_transaction_id: complete ? (newestId || lastSeenId) : lastSeenId,
      resume_cursor: complete ? null : (cursor || null),
      updated_at: new Date().toISOString(),
    });

    let createdOrders = 0;
    for (const row of ledgerRows) {
      const { data: order, error: orderErr } = await admin.from("orders").insert({
        status: "paid",
        currency: "robux",
        subtotal_usd: 0,
        total_usd: 0,
        total_robux: row.amount,
        source: row.is_parcel ? "parcel" : "robux",
        external_transaction_id: row.id,
        created_at: row.created_at,
        paid_at: row.created_at,
      }).select().single();
      if (orderErr || !order) continue; // already synced (unique constraint) - skip
      await admin.from("order_items").insert({
        order_id: order.id,
        product_id: null,
        product_slug: row.is_parcel ? "parcel-hub-item" : "robux-payment",
        title: row.is_parcel ? "Parcel Order" : "Robux Payment",
        unit_price_usd: 0,
        qty: 1,
      });
      createdOrders++;
    }

    if (rateLimited) {
      return json({
        ok: true,
        partial: true,
        totalRobux, parcelRobux, newParcelOrders: createdOrders, pagesScanned: pages,
        error: "Rate limited by Roblox after " + pages + " page(s) - progress saved. Click Sync again in a minute to continue.",
        placeBreakdown,
      });
    }

    return json({ ok: true, totalRobux, parcelRobux, newParcelOrders: createdOrders, pagesScanned: pages, placeBreakdown });
  } catch (err) {
    console.error("[roblox-group-revenue-sync] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
