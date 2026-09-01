// Order-queue gamepass pool.
//
// Replaces the per-product gamepass model. A small pool of reusable passes is
// kept; each Robux checkout LEASES one, has its Roblox price set to that order's
// exact total, and serves that single pass to the buyer.
//
// ── Using game passes in the storefront game BY HAND ──────────────────────────
// The pool shares one Roblox universe ("coldd Storefront") and you can still
// create your own passes there, as long as:
//   1. Never touch a pass named `coldd order pass …` - those are pool-managed.
//      Their price is rewritten per order; editing or gifting one breaks the
//      buyer it's currently leased to (and gifting makes the recipient unable
//      to re-buy it, breaking any future order that draws it). The admin Robux
//      pool card lists every managed pass id.
//   2. Your manual passes ARE counted: pickContainer() reads the live pass
//      count from Roblox, not a stored number, and keeps GAMEPASS_HARD_CAP -
//      MANUAL_PASS_RESERVE slots free for you. So a manual pass won't fail to
//      create because auto-provisioning took the last slot, and the pool won't
//      over-provision because it can't see your passes.
//   3. If a specific pool pass ends up owned by a buyer some other way (you
//      sold/gave it to them), add the (gamepass_id, roblox_id) pair to
//      roblox_owned_passes - lease_roblox_pass excludes it for that buyer.
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

import { createGamepass, updateGamepass, pickContainer } from "./roblox.ts";

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
    name: `coldd order pass ${Date.now().toString(36)}`,
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

/**
 * Leases a pass for an order and prices it. Idempotent per order: calling twice
 * returns the same pass rather than consuming a second one, which is what makes
 * a double-submitted or retried checkout safe.
 */
// deno-lint-ignore no-explicit-any
export async function leasePassForOrder(
  admin: any,
  orderId: string,
  priceRobux: number,
  buyerRobloxId: string,
): Promise<LeaseOutcome> {
  const price = Math.max(1, Math.round(priceRobux));

  const owned = await passesAlreadyOwnedBy(admin, buyerRobloxId);
  let row = await tryLease(admin, orderId, owned);

  if (!row) {
    // Pool exhausted, OR every remaining pass is one this buyer already owns.
    // Either way a fresh pass (never sold to anyone) is the only thing that
    // can fix it - grow the pool once and retry. "Once" because a second
    // failure means the containers are full, which no amount of retrying
    // fixes.
    const grew = await provisionPass(admin);
    if (grew) row = await tryLease(admin, orderId, owned);
  }

  if (!row) {
    return {
      ok: false,
      code: "POOL_EXHAUSTED",
      error: "Robux checkout is busy right now. Please try again in a few minutes.",
    };
  }

  try {
    await updateGamepass(String(row.universe_id), String(row.gamepass_id), {
      price,
      isForSale: true,
    });
  } catch (e) {
    // Could not price it - hand the pass straight back rather than holding a
    // pass the buyer cannot correctly pay for.
    await admin.rpc("release_roblox_pass", { p_order_id: orderId });
    console.error("[roblox_pool] price update failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Could not prepare your Robux payment. Please try again." };
  }

  // Recorded only after Roblox confirmed the price, so the stored figure always
  // reflects what a buyer could actually have paid.
  await admin.rpc("set_roblox_pass_price", { p_order_id: orderId, p_price_robux: price });

  return {
    ok: true,
    pass: {
      gamepassId: String(row.gamepass_id),
      universeId: String(row.universe_id),
      priceRobux: price,
    },
  };
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
