// supabase/functions/_shared/roblox_shirt.ts
//
// The single-shirt fallback for Robux checkout. See supabase/roblox_shirt_lease.sql
// for the "pool of one" reasoning - this file is the Roblox-side half:
// pricing the classic group shirt and reading its sales back.
//
// There is NO Open Cloud API for classic-clothing pricing. The only way to
// set a classic asset's price is the legacy, cookie-authenticated
// itemconfiguration.roblox.com endpoint, which needs a .ROBLOSECURITY cookie
// (we reuse ROBLOX_FALLBACK_COOKIE, already used for the group sale ledger)
// plus an x-csrf-token handshake: the first POST comes back 403 with a fresh
// token in the `x-csrf-token` response header, and you retry with it.

import { notifyRobloxCookieBroken } from "./roblox.ts";

const ITEM_CONFIG_BASE = "https://itemconfiguration.roblox.com/v1";

function shirtCookie(): string | null {
  return Deno.env.get("ROBLOX_FALLBACK_COOKIE") ?? null;
}

/** The group's one classic shirt. Row is seeded in roblox_shirt_lease.sql;
 *  this env var is the override used before the row exists / for functions
 *  that don't read the table. */
export function shirtAssetId(): string {
  return Deno.env.get("ROBLOX_SHIRT_ASSET_ID") ?? "139180297115581";
}

// One cached CSRF token per warm isolate - Roblox keeps them valid for a
// while, and every 403 refreshes it anyway.
let csrfToken = "";

/**
 * POSTs to a cookie-authenticated Roblox endpoint, doing the x-csrf-token
 * dance. Returns the Response (caller checks .ok); throws only on a missing
 * cookie or a network failure.
 */
async function csrfPost(url: string, body: unknown): Promise<Response> {
  const cookie = shirtCookie();
  if (!cookie) throw new Error("ROBLOX_FALLBACK_COOKIE is not set - can't price the shirt.");

  const doFetch = () =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 403) {
    const fresh = res.headers.get("x-csrf-token");
    if (fresh && fresh !== csrfToken) {
      csrfToken = fresh;
      res = await doFetch();
    }
  }
  if (res.status === 401) {
    await notifyRobloxCookieBroken(`Shirt pricing got HTTP 401 - the cookie is likely expired.`);
  }
  return res;
}

/**
 * Sets the shirt's price to an exact whole-Robux amount and makes sure it's
 * on sale. Throws on failure - the caller must not hand a buyer a shirt it
 * couldn't price.
 *
 * `release` sets price + sale status in one call and is idempotent for an
 * already-released asset in practice; if Roblox ever rejects it for that
 * reason we fall back to `update-price` (price only - the shirt is already
 * on sale, since the group sells it by hand).
 */
export async function setShirtPrice(assetId: string, priceRobux: number): Promise<void> {
  const price = Math.max(1, Math.round(priceRobux));

  const releaseRes = await csrfPost(`${ITEM_CONFIG_BASE}/assets/${assetId}/release`, {
    saleStatus: "OnSale",
    priceConfiguration: { priceInRobux: price },
    releaseConfiguration: { saleAvailabilityLocations: ["ExperiencesDevApiOnly", "Catalog"] },
  });
  if (releaseRes.ok) return;

  const updateRes = await csrfPost(`${ITEM_CONFIG_BASE}/assets/${assetId}/update-price`, {
    priceConfiguration: { priceInRobux: price },
  });
  if (updateRes.ok) return;

  const detail = await updateRes.text().catch(() => "");
  throw new Error(`Roblox rejected the shirt price update (HTTP ${updateRes.status}): ${detail.slice(0, 200)}`);
}

/**
 * Best-effort "take the shirt off sale" for the gap between leases, so nobody
 * can buy it at the previous buyer's price. Non-fatal: the next lease re-prices
 * and re-lists it before anyone is pointed at it, exactly like releasePass.
 */
export async function setShirtOffSale(assetId: string): Promise<void> {
  try {
    const res = await csrfPost(`${ITEM_CONFIG_BASE}/assets/${assetId}/release`, {
      saleStatus: "OffSale",
      priceConfiguration: { priceInRobux: 1 },
      releaseConfiguration: { saleAvailabilityLocations: ["ExperiencesDevApiOnly", "Catalog"] },
    });
    if (!res.ok) console.error("[roblox_shirt] setShirtOffSale non-ok", res.status);
  } catch (e) {
    console.error("[roblox_shirt] setShirtOffSale error", e instanceof Error ? e.message : e);
  }
}

export type ShirtLeaseRow = {
  asset_id: string;
  leased_order_id: string | null;
  leased_at: string | null;
  lease_expires_at: string | null;
  lease_price_robux: number | null;
};

export type ShirtLeaseOutcome =
  | { ok: true; assetId: string; priceRobux: number }
  | { ok: false; code: "SHIRT_BUSY" | "PRICE_FAILED"; error: string };

/** How long a buyer has to complete before the shirt returns to the pool.
 *  Matches the gamepass pool's window. */
const LEASE_TTL_SECONDS = 900;

/**
 * Leases the shirt for an order and prices it. Idempotent per order. Leases
 * FIRST (in Postgres), then prices on Roblox - if pricing fails the lease is
 * released immediately so a wedged Roblox call doesn't hold the one shirt
 * hostage.
 */
// deno-lint-ignore no-explicit-any
export async function leaseShirtForOrder(
  admin: any,
  orderId: string,
  priceRobux: number,
): Promise<ShirtLeaseOutcome> {
  const price = Math.max(1, Math.round(priceRobux));

  const { data, error } = await admin.rpc("lease_roblox_shirt", {
    p_order_id: orderId,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (error) throw new Error(`lease_roblox_shirt failed: ${error.message}`);
  const row: ShirtLeaseRow | null = Array.isArray(data) ? data[0] : data;
  if (!row || !row.leased_order_id) {
    return { ok: false, code: "SHIRT_BUSY", error: "The shirt is being used by another buyer right now." };
  }

  try {
    await setShirtPrice(row.asset_id, price);
  } catch (e) {
    await admin.rpc("release_roblox_shirt", { p_order_id: orderId });
    console.error("[roblox_shirt] price failed, lease released", e instanceof Error ? e.message : e);
    return { ok: false, code: "PRICE_FAILED", error: "Could not prepare the shirt payment. Please try again." };
  }
  await admin.rpc("set_roblox_shirt_price", { p_order_id: orderId, p_price_robux: price });

  return { ok: true, assetId: row.asset_id, priceRobux: price };
}

/** The shirt lease currently held by an order, if any. */
// deno-lint-ignore no-explicit-any
export async function getShirtLease(admin: any, orderId: string): Promise<ShirtLeaseRow | null> {
  const { data } = await admin
    .from("roblox_shirt_lease")
    .select("asset_id, leased_order_id, leased_at, lease_expires_at, lease_price_robux")
    .eq("leased_order_id", orderId)
    .maybeSingle();
  return data ?? null;
}

/** Returns the shirt to the pool and takes it off sale. */
// deno-lint-ignore no-explicit-any
export async function releaseShirt(admin: any, orderId: string, assetId: string): Promise<void> {
  await setShirtOffSale(assetId);
  await admin.rpc("release_roblox_shirt", { p_order_id: orderId });
}

/**
 * Confirms a purchase of the shirt by this buyer, after this lease began.
 *
 * Deliberately does NOT check the amount. Roblox's marketplace fee on classic
 * clothing is changing, so the group's share of a sale is no longer a fixed
 * fraction of the price we can match against - the instruction is to match on
 * buyer + asset + timing only. Exclusivity still makes this safe: only one
 * order can hold the shirt at a time, that order set the current price, and
 * the timing check rejects any purchase from before the lease.
 */
export async function findShirtSale(
  assetId: string,
  buyerRobloxId: string,
  leasedAtIso: string,
): Promise<{ found: boolean; reason?: string }> {
  const cookie = shirtCookie();
  const groupId = Deno.env.get("ROBLOX_GROUP_ID");
  if (!cookie || !groupId) return { found: false, reason: "NOT_CONFIGURED" };

  try {
    const url = `https://economy.roblox.com/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100&sortOrder=Desc`;
    const res = await fetch(url, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
    if (res.status === 401 || res.status === 403) {
      console.error("[roblox_shirt] sale lookup: cookie rejected", res.status);
      await notifyRobloxCookieBroken(`Shirt sale lookup got HTTP ${res.status} - the cookie is likely expired.`);
      return { found: false, reason: "COOKIE_BROKEN" };
    }
    if (!res.ok) return { found: false, reason: "LOOKUP_FAILED" };

    const data = await res.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const rows: any[] = data.data || [];
    const leasedAt = Date.parse(leasedAtIso);

    const match = rows.find((row) => {
      const details = row.details || {};
      const agent = row.agent || {};
      if (String(details.id) !== String(assetId)) return false;
      if (String(agent.id) !== String(buyerRobloxId)) return false;
      const created = Date.parse(row.created ?? "");
      if (!Number.isFinite(created) || !Number.isFinite(leasedAt)) return false;
      // Small allowance for clock skew between Roblox and us.
      return created >= leasedAt - 120_000;
    });

    if (!match) {
      const nearMiss = rows.find((row) =>
        String((row.details || {}).id) === String(assetId) &&
        String((row.agent || {}).id) === String(buyerRobloxId)
      );
      if (nearMiss) {
        console.error("[roblox_shirt] findShirtSale: same asset+buyer row exists but predates the lease -",
          "created:", nearMiss.created, "leasedAt:", leasedAtIso);
      } else {
        console.error("[roblox_shirt] findShirtSale: no row for asset", assetId, "buyer", buyerRobloxId, "in last", rows.length, "sales");
      }
    }

    return { found: !!match };
  } catch (err) {
    console.error("[roblox_shirt] sale lookup error:", err);
    return { found: false, reason: "LOOKUP_FAILED" };
  }
}
