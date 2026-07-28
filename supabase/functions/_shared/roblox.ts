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
