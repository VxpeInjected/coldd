// supabase/functions/_shared/roblox.ts
//
// Thin client for Roblox's Game Passes Open Cloud API (beta), shared
// between admin-upsert-product and admin-delete-product. Schema
// confirmed against Roblox's published OpenAPI spec (Roblox/creator-docs
// on GitHub, content/en-us/reference/cloud/game-passes-http-service/
// v1.json) rather than guessed - requests are multipart/form-data, not
// JSON, and price is a plain integer (whole Robux, no decimals).

const ROBLOX_API_BASE = "https://apis.roblox.com/game-passes/v1";

function apiKey() {
  return Deno.env.get("ROBLOX_API_KEY")!;
}

export type GamePassConfig = {
  gamePassId: number;
  name: string;
  description: string;
  isForSale: boolean;
  iconAssetId: number;
  priceInformation?: { defaultPriceInRobux?: number | null };
};

export async function createGamepass(
  universeId: string,
  opts: { name: string; description?: string; price: number }
): Promise<GamePassConfig> {
  const form = new FormData();
  form.set("name", opts.name.slice(0, 50));
  if (opts.description) form.set("description", opts.description.slice(0, 1000));
  form.set("isForSale", "true");
  form.set("price", String(Math.max(0, Math.round(opts.price))));

  const res = await fetch(`${ROBLOX_API_BASE}/universes/${universeId}/game-passes`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && data.errorMessage) || `Roblox gamepass create failed (${res.status})`);
  }
  return data as GamePassConfig;
}

export async function updateGamepass(
  universeId: string,
  gamePassId: string,
  opts: { price?: number; isForSale?: boolean; name?: string; description?: string }
): Promise<void> {
  const form = new FormData();
  if (opts.name != null) form.set("name", opts.name.slice(0, 50));
  if (opts.description != null) form.set("description", opts.description.slice(0, 1000));
  if (opts.price != null) form.set("price", String(Math.max(0, Math.round(opts.price))));
  if (opts.isForSale != null) form.set("isForSale", String(opts.isForSale));

  const res = await fetch(`${ROBLOX_API_BASE}/universes/${universeId}/game-passes/${gamePassId}`, {
    method: "PATCH",
    headers: { "x-api-key": apiKey() },
    body: form,
  });
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  throw new Error((data && data.errorMessage) || `Roblox gamepass update failed (${res.status})`);
}

export type RobloxContainer = { id: string; universe_id: string; gamepass_count: number };

// Picks the oldest active container with room (<50 gamepasses). Returns
// null if the pool is exhausted - callers must hard-block product
// creation in that case, since Roblox has no API to create a new
// experience/universe.
// deno-lint-ignore no-explicit-any
export async function pickContainer(admin: any): Promise<RobloxContainer | null> {
  const { data, error } = await admin
    .from("roblox_containers")
    .select("id, universe_id, gamepass_count")
    .eq("active", true)
    .lt("gamepass_count", 50)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as RobloxContainer;
}

/* ================================================================
   ROBUX CHECKOUT (create-robux-order / verify-robux-order)
   ================================================================ */

export const ROBUX_PER_USD = 80; // matches app.js's ROBUX_PER_USD/admin.js's fallback

export type RobuxCartItem = { slug: string; qty: number; licence?: string };
export type RobuxPricedLine = {
  slug: string;
  title: string;
  unitRobux: number;
  unitPriceUsd: number;
  qty: number;
  productId: string;
  gamePassId: string;
};

// Robux-specific pricing: requires a linked gamepass (Phase B creates one
// for every Roblox product on save) and rejects resell licences - Robux
// pricing doesn't support resell anywhere else in this codebase either
// (see product.html/app.js's cart+checkout fix).
// deno-lint-ignore no-explicit-any
export async function priceRobuxItems(
  admin: any,
  items: RobuxCartItem[],
): Promise<{ ok: true; lines: RobuxPricedLine[]; totalRobux: number } | { ok: false; error: string }> {
  if (!items.length) return { ok: false, error: "Your cart is empty." };
  if (items.length > 20) return { ok: false, error: "Too many items in one order." };

  const slugs = Array.from(new Set(items.map((i) => String(i.slug || ""))));
  const { data: products, error } = await admin
    .from("products")
    .select("id, slug, title, price_usd, robux_price, roblox_gamepass_id, platform")
    .in("slug", slugs)
    .eq("is_active", true);
  if (error) return { ok: false, error: "Could not load products." };

  // deno-lint-ignore no-explicit-any
  const bySlug = new Map((products ?? []).map((p: any) => [p.slug, p]));
  const lines: RobuxPricedLine[] = [];
  for (const raw of items) {
    const slug = String(raw.slug || "");
    const qty = Math.max(1, Math.min(20, Math.floor(Number(raw.qty) || 1)));
    if (raw.licence === "resell") return { ok: false, error: "Robux checkout doesn't support resell-licence items." };
    const product = bySlug.get(slug);
    if (!product) return { ok: false, error: `"${slug}" is no longer available.` };
    if (product.platform !== "Roblox" || !product.roblox_gamepass_id) {
      return { ok: false, error: `${product.title} isn't available for Robux checkout yet.` };
    }
    const unitRobux = product.robux_price != null ? Number(product.robux_price) : Math.round(Number(product.price_usd) * ROBUX_PER_USD);
    lines.push({
      slug,
      title: product.title,
      unitRobux,
      unitPriceUsd: Number(product.price_usd),
      qty,
      productId: product.id,
      gamePassId: product.roblox_gamepass_id,
    });
  }

  const totalRobux = lines.reduce((sum, li) => sum + li.unitRobux * li.qty, 0);
  return { ok: true, lines, totalRobux };
}

export type RobloxTokenSet = { accessToken: string; robloxId: string };

// Loads the caller's linked Roblox account, refreshing the OAuth token if
// it's expired (Roblox access tokens are short-lived). Returns null if
// there's no link at all - callers should prompt the user to link.
// deno-lint-ignore no-explicit-any
export async function getValidRobloxToken(admin: any, userId: string): Promise<RobloxTokenSet | null> {
  const { data: acct, error } = await admin
    .from("roblox_accounts")
    .select("roblox_id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !acct) return null;

  const expiresAt = new Date(acct.expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return { accessToken: acct.access_token, robloxId: acct.roblox_id };
  }

  const clientId = Deno.env.get("ROBLOX_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ROBLOX_OAUTH_CLIENT_SECRET")!;
  const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: acct.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("[roblox] token refresh failed:", tokenRes.status, tokenData);
    return null;
  }

  const newExpiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();
  await admin
    .from("roblox_accounts")
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || acct.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("user_id", userId);

  return { accessToken: tokenData.access_token, robloxId: acct.roblox_id };
}

// Thrown when Roblox rejects the inventory call for auth reasons (401/403)
// rather than "not found" - most commonly a token authorized before
// user.inventory-item:read was requested (refreshing an existing token
// keeps its original scope; only a fresh /authorize round-trip grants a
// newly-added scope). Callers should tell the buyer to re-link, not
// treat this as "just wait and retry."
export class RobloxInsufficientScopeError extends Error {
  constructor(status: number) {
    super(`Roblox inventory check rejected with HTTP ${status} - likely missing the inventory scope.`);
    this.name = "RobloxInsufficientScopeError";
  }
}

// Checks which of the given gamePassIds appear in the target user's
// Roblox inventory, using their own OAuth token (requires the
// user.inventory-item:read scope, granted at link time). Filter syntax
// confirmed against Roblox's docs (create.roblox.com/docs/cloud/reference/
// patterns#list-inventory-items): semicolon-separated field=value pairs,
// gamePassIds takes a comma-separated list. Paginates defensively even
// though a single filtered request should normally fit on one page.
export async function findOwnedGamePasses(
  accessToken: string,
  robloxUserId: string,
  gamePassIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (!gamePassIds.length) return found;

  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      filter: `gamePasses=true;gamePassIds=${gamePassIds.join(",")}`,
      maxPageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://apis.roblox.com/cloud/v2/users/${robloxUserId}/inventory-items?${params.toString()}`,
      { headers: { Authorization: "Bearer " + accessToken } },
    );
    if (res.status === 401 || res.status === 403) {
      throw new RobloxInsufficientScopeError(res.status);
    }
    if (!res.ok) {
      console.error("[roblox] inventory check failed:", res.status, await res.text().catch(() => ""));
      break;
    }
    const data = await res.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    (data.inventoryItems || []).forEach((item: any) => {
      const id = item.gamePassDetails && item.gamePassDetails.gamePassId;
      if (id) found.add(String(id));
    });
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return found;
}

/* ================================================================
   GROUP-TRANSACTION FALLBACK (Phase D) - only runs if
   ROBLOX_FALLBACK_COOKIE is set. This is the legacy, cookie-authenticated
   economy.roblox.com API (not Open Cloud, not in the published OpenAPI
   spec the rest of this file was verified against) - its exact response
   shape could not be confirmed ahead of time without a live cookie, so
   this is best-effort and fails soft (logs + returns false) rather than
   throwing, on the assumption the primary inventory check already
   covers the common case and this is a secondary safety net.
   ================================================================ */

export function robloxFallbackConfigured(): boolean {
  return !!Deno.env.get("ROBLOX_FALLBACK_COOKIE");
}

// Checks the group's recent Sale transactions for a purchase of the given
// gamePassId by the given Roblox buyer. Returns true/false; never throws.
export async function checkGroupTransactionForSale(
  gamePassId: string,
  buyerRobloxId: string,
): Promise<boolean> {
  const cookie = Deno.env.get("ROBLOX_FALLBACK_COOKIE");
  const groupId = Deno.env.get("ROBLOX_GROUP_ID");
  if (!cookie || !groupId) return false;

  try {
    const url = `https://economy.roblox.com/v2/groups/${groupId}/transactions?transactionType=Sale&limit=100&sortOrder=Desc`;
    const res = await fetch(url, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
    if (res.status === 401 || res.status === 403) {
      console.error("[roblox] fallback cookie rejected:", res.status);
      await notifyRobloxCookieBroken(`Group transaction check got HTTP ${res.status} - the fallback cookie is likely expired.`);
      return false;
    }
    if (!res.ok) {
      console.error("[roblox] group transactions fetch failed:", res.status);
      return false;
    }
    const data = await res.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const rows: any[] = data.data || [];
    return rows.some((row) => {
      const details = row.details || {};
      const agent = row.agent || {};
      return String(details.id) === String(gamePassId) && String(agent.id) === String(buyerRobloxId);
    });
  } catch (err) {
    console.error("[roblox] group transaction check error:", err);
    return false;
  }
}

// Posts a Discord webhook alert (if configured) on cookie failure. Not
// deduplicated here - callers (verify-robux-order, the scheduled
// roblox-cookie-healthcheck function) are expected to only call this on
// an actual failure, and the healthcheck function additionally tracks
// healthy->broken transitions so routine checks don't spam the channel.
export async function notifyRobloxCookieBroken(detail: string): Promise<void> {
  const webhook = Deno.env.get("ROBLOX_ALERT_WEBHOOK_URL");
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `:warning: Roblox fallback cookie problem: ${detail}` }),
    });
  } catch (err) {
    console.error("[roblox] failed to post cookie-broken alert:", err);
  }
}
