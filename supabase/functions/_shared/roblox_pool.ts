// Order-queue gamepass pool.
//
// Replaces the per-product gamepass model. A small pool of reusable passes is
// kept; each Robux checkout LEASES one, has its Roblox price set to that order's
// exact total, and serves that single pass to the buyer.
//
// ── Using game passes in the storefront game BY HAND ──────────────────────────
// The pool shares one Roblox universe ("coldd Storefront") and you can create
// and use your own passes there freely. The pool defends itself:
//   1. Grab any pass and RENAME it (off the `coldd order pass …` auto-name) to
//      make it yours. The next checkout that would have drawn it reads it back,
//      sees the rename, drops it from the pool automatically, and leases a
//      clean pass instead - no admin step. (Restore it from the Robux pool card
//      if it was a false alarm.) Renaming is the signal, so always rename first.
//   2. Your passes ARE counted: pickContainer() reads the live pass count from
//      Roblox, not a stored number, and keeps GAMEPASS_HARD_CAP -
//      MANUAL_PASS_RESERVE slots free, so a hand-made pass never fails to
//      create and the pool never over-provisions.
//   3. If the buyer's inventory scope (user.inventory-item:read) is granted,
//      leasePassForOrder also checks the buyer doesn't already own the exact
//      pass and swaps if they do. Until then, if a pool pass ends up owned by
//      a specific buyer, add (gamepass_id, roblox_id) to roblox_owned_passes.
//   4. Only real risk left: editing/re-pricing a pass WITHOUT renaming it while
//      it's leased to a live order (15-min window). Rename it and you're safe.
//
// Ordering matters and is not arbitrary:
//
//   1. LEASE FIRST, in Postgres. Exclusivity has to be won before anything is
//      mutated on Roblox, because Roblox has no transactions and no
//      compare-and-set on price. Two buyers sharing a pass means the cheaper
//      one can pay the cheaper price and be credited the dearer order.
//   2. THEN set the price on Roblox.
//   3. THEN record the price we set, so verification compares against the price
//      for THIS lease rather than against the order total alone.
//
// If step 2 fails the lease is released immediately - holding a pass we could
// not price would shrink the pool for nothing.

import { createGamepass, updateGamepass, getGamepass, pickContainer, findOwnedGamePasses } from "./roblox.ts";

// Every pool pass is auto-named with this prefix. If a pass's live name no
// longer starts with it, someone renamed it by hand - it's being used
// manually and must drop out of the pool.
export const POOL_PASS_PREFIX = "coldd order pass ";

export type LeasedPass = {
  gamepassId: string;
  universeId: string;
  priceRobux: number;
};

export type LeaseOutcome =
  | { ok: true; pass: LeasedPass }
  | { ok: false; error: string; code?: string };

/** How long a buyer has to complete before the pass returns to the pool. */
const LEASE_TTL_SECONDS = 900; // 15 minutes

// deno-lint-ignore no-explicit-any
async function tryLease(admin: any, orderId: string, excludeGamepassIds?: string[]) {
  const { data, error } = await admin.rpc("lease_roblox_pass", {
    p_order_id: orderId,
    p_ttl_seconds: LEASE_TTL_SECONDS,
    p_exclude_gamepass_ids: excludeGamepassIds && excludeGamepassIds.length ? excludeGamepassIds : null,
  });
  if (error) throw new Error(`lease_roblox_pass failed: ${error.message}`);
  // The RPC returns the row, or nothing when the pool is exhausted.
  const row = Array.isArray(data) ? data[0] : data;
  return row && row.id ? row : null;
}

// Gamepasses this buyer already owns, sourced ONLY from our own paid-order
// history - this is the one signal that's actually reliable. A live check
// against Roblox's inventory-items API used to feed roblox_owned_passes
// too, but it reported a buyer as owning a pool pass created under a
// second earlier, with zero sale transactions for it ever - Roblox's
// inventory endpoint appears to surface passes an account has management/
// edit rights over (as ours does, being published under the account's own
// group), not just ones actually purchased. That check is gone; every real
// purchase already creates a paid order row here, so this covers the only
// scenario that can actually happen under the pool model - a buyer cannot
// come to own one of these randomly-named auto-generated passes any other
// way. roblox_owned_passes is kept as a manual override table (nothing
// currently writes to it automatically) in case a specific pass/buyer pair
// ever needs excluding by hand.
// deno-lint-ignore no-explicit-any
export async function passesAlreadyOwnedBy(admin: any, buyerRobloxId: string): Promise<string[]> {
  const [ordersRes, ownedRes] = await Promise.all([
    admin
      .from("orders")
      .select("roblox_gamepass_id")
      .eq("roblox_buyer_id", buyerRobloxId)
      .eq("status", "paid")
      .not("roblox_gamepass_id", "is", null),
    admin
      .from("roblox_owned_passes")
      .select("gamepass_id")
      .eq("roblox_id", buyerRobloxId),
  ]);
  const fromOrders = (ordersRes.data ?? []).map((o: { roblox_gamepass_id: string }) => String(o.roblox_gamepass_id));
  const fromDetected = (ownedRes.data ?? []).map((o: { gamepass_id: string }) => String(o.gamepass_id));
  return Array.from(new Set([...fromOrders, ...fromDetected]));
}

/**
 * Adds one pass to the pool. Called only when every existing pass is busy, so
 * the pool grows to meet real concurrency instead of being sized by guesswork.
 *
 * Roblox caps a universe at 50 gamepasses and offers no API to create new
 * experiences, so this can genuinely run out - in which case the caller must
 * fail the checkout rather than silently serve a wrong pass.
 */
// deno-lint-ignore no-explicit-any
export async function provisionPass(admin: any): Promise<boolean> {
  const container = await pickContainer(admin);
  if (!container) return false;

  const created = await createGamepass(container.universe_id, {
    name: `${POOL_PASS_PREFIX}${Date.now().toString(36)}`,
    description: "Automatically managed by coldd checkout. Price changes per order.",
    price: 1,
  });
  const gamepassId = String(created.gamePassId ?? "");
  if (!gamepassId) return false;

  const { error } = await admin.from("roblox_pool_passes").insert({
    gamepass_id: gamepassId,
    universe_id: container.universe_id,
    label: "auto-provisioned",
  });
  if (error) {
    // The pass exists on Roblox but we could not record it. Leaving it
    // unrecorded is the safe failure: an untracked pass is inert, whereas a
    // duplicate row could be leased twice.
    console.error("[roblox_pool] created gamepass but insert failed", error.message);
    return false;
  }

  await admin.rpc("increment_roblox_container", { p_id: container.id });
  return true;
}

type LiveGamepass = { name?: string; isForSale?: boolean; priceInformation?: { defaultPriceInRobux?: number | null } };

// A renamed pool pass is being used by hand - that's the one signal solid
// enough to act on automatically (the auto-name is useless for any real
// purpose, so staff always rename). A price/for-sale mismatch right after we
// PATCH could just be Roblox read-after-write lag, so those are logged, not
// acted on.
function tamperReason(live: LiveGamepass | null, expectedPrice: number): string | null {
  if (!live) return null; // couldn't read it - don't punish the pass for a flaky API call
  if (typeof live.name === "string" && !live.name.startsWith(POOL_PASS_PREFIX)) return "renamed";
  const livePrice = live.priceInformation?.defaultPriceInRobux;
  if ((typeof livePrice === "number" && livePrice !== expectedPrice && livePrice !== 1) || live.isForSale === false) {
    console.warn(`[roblox_pool] pass live state off (price ${livePrice} vs ${expectedPrice}, forSale ${live.isForSale}) - watching, not acting`);
  }
  return null;
}

/**
 * Leases a pass for an order and prices it. Idempotent per order: calling twice
 * returns the same pass rather than consuming a second one, which is what makes
 * a double-submitted or retried checkout safe.
 *
 * AUTOMATIC manual-use detection: after pricing, the pass's live name is read
 * back. If it's been renamed off the auto-name (i.e. staff are using it), it's
 * dropped from the pool and a different pass is leased instead - no admin
 * action, the buyer just gets a clean pass. Same if the buyer already owns the
 * exact pass (needs the inventory scope). Capped so a genuinely exhausted pool
 * still fails cleanly.
 */
// deno-lint-ignore no-explicit-any
export async function leasePassForOrder(
  admin: any,
  orderId: string,
  priceRobux: number,
  buyerRobloxId: string,
  buyerAccessToken?: string,
): Promise<LeaseOutcome> {
  const price = Math.max(1, Math.round(priceRobux));
  const owned = await passesAlreadyOwnedBy(admin, buyerRobloxId);
  const tainted: string[] = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    let row = await tryLease(admin, orderId, [...owned, ...tainted]);
    if (!row) {
      // Pool exhausted, or every remaining pass is one this buyer owns / we
      // just retired. A fresh pass is the only fix - grow once and retry.
      const grew = await provisionPass(admin);
      if (grew) row = await tryLease(admin, orderId, [...owned, ...tainted]);
    }
    if (!row) {
      return {
        ok: false,
        code: "POOL_EXHAUSTED",
        error: "Robux checkout is busy right now. Please try again in a few minutes.",
      };
    }

    const universeId = String(row.universe_id);
    const gamepassId = String(row.gamepass_id);

    try {
      await updateGamepass(universeId, gamepassId, { price, isForSale: true });
    } catch (e) {
      await admin.rpc("release_roblox_pass", { p_order_id: orderId });
      console.error("[roblox_pool] price update failed", e instanceof Error ? e.message : e);
      return { ok: false, error: "Could not prepare your Robux payment. Please try again." };
    }
    await admin.rpc("set_roblox_pass_price", { p_order_id: orderId, p_price_robux: price });

    // Read the pass back and make sure nobody's been editing it by hand.
    const reason = tamperReason(await getGamepass(universeId, gamepassId), price);
    let ownsIt = false;
    if (!reason && buyerAccessToken) {
      try {
        ownsIt = (await findOwnedGamePasses(buyerAccessToken, buyerRobloxId, [gamepassId])).has(gamepassId);
      } catch (_e) { /* no inventory scope / API down - skip, not fatal */ }
    }

    if (reason) {
      console.warn(`[roblox_pool] pass ${gamepassId} looks hand-managed (${reason}) - dropping it from the pool and re-leasing`);
      // Drop it from OUR table only. Don't touch it on Roblox - if staff
      // renamed/re-priced it, it's theirs now; changing it back would fight
      // them. It's permanently out of rotation (Restore in the admin card
      // if it was a false alarm).
      await admin.from("roblox_pool_passes")
        .update({ active: false, leased_order_id: null, leased_at: null, lease_expires_at: null, lease_price_robux: null })
        .eq("gamepass_id", gamepassId);
      tainted.push(gamepassId);
      continue;
    }
    if (ownsIt) {
      console.warn(`[roblox_pool] buyer ${buyerRobloxId} already owns pool pass ${gamepassId} - swapping to another`);
      await releasePass(admin, orderId, universeId, gamepassId);
      tainted.push(gamepassId);
      continue;
    }

    return { ok: true, pass: { gamepassId, universeId, priceRobux: price } };
  }

  return {
    ok: false,
    code: "POOL_EXHAUSTED",
    error: "Robux checkout is busy right now. Please try again in a few minutes.",
  };
}

/**
 * Takes a pass in or out of the rotation. Use "retire" (active=false) before
 * you buy, gift, rename or hand-price a pool pass yourself - it drops out of
 * leasing immediately, any current lease is cleared, and it's taken off sale
 * on Roblox. "restore" puts it back; the next lease re-prices and re-enables
 * it, so a stale price left on it doesn't matter.
 */
// deno-lint-ignore no-explicit-any
export async function setPassActive(admin: any, gamepassId: string, active: boolean) {
  const { data: pass } = await admin
    .from("roblox_pool_passes")
    .select("gamepass_id, universe_id, leased_order_id, lease_expires_at")
    .eq("gamepass_id", String(gamepassId))
    .maybeSingle();
  if (!pass) return { ok: false as const, error: "That pass isn't in the pool." };

  if (!active) {
    // Don't pull a pass out from under a checkout that's mid-flight.
    if (pass.leased_order_id && pass.lease_expires_at && new Date(pass.lease_expires_at).getTime() > Date.now()) {
      const { data: ord } = await admin.from("orders").select("status").eq("id", pass.leased_order_id).maybeSingle();
      if (ord && ord.status === "pending") {
        return { ok: false as const, error: "This pass is serving a live order right now. Wait for it to finish or cancel that order first." };
      }
    }
    try {
      await updateGamepass(String(pass.universe_id), String(pass.gamepass_id), { isForSale: false });
    } catch (e) {
      // Non-fatal: it's out of rotation regardless.
      console.error("[roblox_pool] retire: could not take pass off sale", e instanceof Error ? e.message : e);
    }
  }

  const patch = active
    ? { active: true }
    : { active: false, leased_order_id: null, leased_at: null, lease_expires_at: null, lease_price_robux: null };
  const { error } = await admin.from("roblox_pool_passes").update(patch).eq("gamepass_id", String(gamepassId));
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Returns the pass currently leased to an order, if any. */
// deno-lint-ignore no-explicit-any
export async function getLeasedPass(admin: any, orderId: string) {
  const { data } = await admin
    .from("roblox_pool_passes")
    .select("gamepass_id, universe_id, lease_price_robux, lease_expires_at")
    .eq("leased_order_id", orderId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Returns a pass to the pool and takes it off sale. Called after a verified
 * purchase, so the next buyer cannot pay the previous buyer's price during the
 * window before it is re-leased and re-priced.
 */
// deno-lint-ignore no-explicit-any
export async function releasePass(admin: any, orderId: string, universeId: string, gamepassId: string) {
  try {
    await updateGamepass(universeId, gamepassId, { isForSale: false });
  } catch (e) {
    // Non-fatal: the pass is still released below, and the next lease re-prices
    // and re-enables it before anyone is pointed at it.
    console.error("[roblox_pool] could not take pass off sale", e instanceof Error ? e.message : e);
  }
  await admin.rpc("release_roblox_pass", { p_order_id: orderId });
}

/**
 * Hands a tainted pass back to the pool and leases the same order a fresh
 * one, excluding every pass this buyer is known (via passesAlreadyOwnedBy)
 * to own. Same price, same order - the buyer's "Buy on Roblox" link just
 * needs to change, not the whole checkout.
 *
 * Not currently called automatically - it was triggered from
 * verify-robux-order's live inventory-ownership fallback, which got
 * removed (see passesAlreadyOwnedBy's comment: that check produced false
 * positives for accounts with management rights over the pass's group,
 * which is exactly the account most likely to be testing this flow).
 * Kept, with its audit trail (roblox_pass_switches /
 * orders.roblox_pass_switch_count), for a possible future admin-triggered
 * "switch this buyer off a tainted pass" action if roblox_owned_passes
 * ever gets a manual entry.
 */
// deno-lint-ignore no-explicit-any
export async function switchLeasedPass(
  admin: any,
  orderId: string,
  universeId: string,
  taintedGamepassId: string,
  priceRobux: number,
  buyerRobloxId: string,
): Promise<LeaseOutcome> {
  await releasePass(admin, orderId, universeId, taintedGamepassId);
  const outcome = await leasePassForOrder(admin, orderId, priceRobux, buyerRobloxId);
  await admin.from("roblox_pass_switches").insert({
    order_id: orderId,
    from_gamepass_id: taintedGamepassId,
    to_gamepass_id: outcome.ok ? outcome.pass.gamepassId : null,
    reason: "already_owned",
  });
  await admin.rpc("increment_order_pass_switch_count", { p_order_id: orderId });
  return outcome;
}
