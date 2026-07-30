// supabase/functions/roblox-group-revenue-sync/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-group-revenue-sync --no-verify-jwt
//
// Scans the group's recent Sale transactions (same cookie-authenticated
// economy.roblox.com endpoint the Phase D purchase-verification fallback
// uses) and accumulates real totals:
//   - total_robux: every Sale transaction in the group ledger - this is
//     the ground truth "Overall Robux revenue" figure, a superset of our
//     own tracked website orders (which pay into the same group).
//   - parcel_robux: the subset of those sales that happened in the
//     separate Parcel Hub game (place id 6156094414, not one of our own
//     products) - logged as synthetic `orders` rows (source='parcel') so
//     they show up in the admin Orders panel too.
//
// Incremental: stops as soon as it reaches the last transaction id seen
// on a previous run, so repeat runs are cheap and nothing is ever
// double-counted. First run walks back up to MAX_PAGES to bootstrap.
//
// Callable either by the cron job (roblox_group_revenue_cron.sql, shared
// ROBLOX_CRON_SECRET header) or an is_admin user (manual "Sync now").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRobloxCookieBroken } from "../_shared/roblox.ts";

const PARCEL_PLACE_ID = "6156094414";
const MAX_PAGES = 50;

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
    let totalRobux = Number(state?.total_robux || 0);
    let parcelRobux = Number(state?.parcel_robux || 0);

    // deno-lint-ignore no-explicit-any
    const parcelSales: any[] = [];
    let newestId: string | null = null;
    let cursor: string | undefined;
    let stop = false;
    let pages = 0;

    while (!stop && pages < MAX_PAGES) {
      let url = `https://economy.roblox.com/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100&sortOrder=Desc`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
      const res = await fetch(url, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
      if (res.status === 401 || res.status === 403) {
        await notifyRobloxCookieBroken(`Group revenue sync got HTTP ${res.status} - the fallback cookie is likely expired.`);
        return json({ ok: false, error: "Fallback cookie rejected." }, 502);
      }
      if (!res.ok) return json({ ok: false, error: "Could not fetch group transactions (HTTP " + res.status + ")." }, 502);

      const data = await res.json().catch(() => ({}));
      // deno-lint-ignore no-explicit-any
      const rows: any[] = data.data || [];
      if (!rows.length) break;

      for (const row of rows) {
        const txId = String(row.id);
        if (txId === lastSeenId) { stop = true; break; }
        if (!newestId) newestId = txId;

        const amount = Number(row.currency?.amount || 0);
        totalRobux += amount;

        const placeId = row.details?.place?.id != null ? String(row.details.place.id) : null;
        if (placeId === PARCEL_PLACE_ID) {
          parcelRobux += amount;
          parcelSales.push({
            externalTransactionId: txId,
            amount,
            itemName: row.details?.name ? String(row.details.name) : "Parcel Hub item",
            createdAt: row.created || new Date().toISOString(),
          });
        }
      }

      cursor = data.nextPageCursor || undefined;
      pages++;
      if (!cursor) break;
    }

    await admin.from("roblox_group_revenue").upsert({
      id: true,
      total_robux: totalRobux,
      parcel_robux: parcelRobux,
      last_transaction_id: newestId || lastSeenId,
      updated_at: new Date().toISOString(),
    });

    let createdOrders = 0;
    for (const sale of parcelSales) {
      const { data: order, error: orderErr } = await admin.from("orders").insert({
        status: "paid",
        currency: "robux",
        subtotal_usd: 0,
        total_usd: 0,
        total_robux: sale.amount,
        source: "parcel",
        external_transaction_id: sale.externalTransactionId,
        created_at: sale.createdAt,
        paid_at: sale.createdAt,
      }).select().single();
      if (orderErr || !order) continue; // already synced (unique constraint) - skip
      await admin.from("order_items").insert({
        order_id: order.id,
        product_id: null,
        product_slug: "parcel-hub-item",
        title: sale.itemName,
        unit_price_usd: 0,
        qty: 1,
      });
      createdOrders++;
    }

    return json({ ok: true, totalRobux, parcelRobux, newParcelOrders: createdOrders, pagesScanned: pages });
  } catch (err) {
    console.error("[roblox-group-revenue-sync] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
