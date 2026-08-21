// supabase/functions/_shared/discount_codes.ts
//
// Mints a real, single-use coupon row for one specific email/campaign
// (the marketing-signup popup, an abandoned-cart nudge, a wishlist
// reminder) instead of any of those places inventing their own fake
// "10% off" copy with nothing backing it - abandoned_cart_2's seeded
// email text used to say "use a code from your latest coupon" with no
// code actually generated anywhere. Every code minted here goes through
// the exact same floor-safe resolveCoupon() path every other coupon in
// the system does the moment someone actually tries to redeem it - this
// file only handles ISSUING the code, never the discount math itself.

// deno-lint-ignore no-explicit-any
export async function mintOneTimeCoupon(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: { prefix: string; pct: number; expiresInDays?: number },
): Promise<string | null> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I - avoids misreads
  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString().slice(0, 10)
    : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `${opts.prefix}-${suffix}`;

    const { error } = await admin.from("coupons").insert({
      code,
      type: "pct",
      val: opts.pct,
      active: true,
      usage_limit: 1,
      usage_count: 0,
      expires_at: expiresAt,
      scope: "sitewide",
    });
    if (!error) return code;
    // Unique violation (collision on the random suffix) - try again with a
    // new one. Any other error means something's actually wrong, so it's
    // not worth retrying.
    if (error.code !== "23505") {
      console.error("[discount_codes] failed to mint coupon:", error);
      return null;
    }
  }
  console.error("[discount_codes] could not mint a unique coupon code after 5 attempts");
  return null;
}

// Mints a bundle_deals row - a hand-picked list of product slugs, each at
// its own discount, with a bigger discount if every one of them ends up
// in the same order. Backs the post-purchase "Build more for less" upsell
// and the wishlist stale-item reminder email; priceItems() is what
// actually applies it once a checkout carries the token.
// deno-lint-ignore no-explicit-any
export async function mintBundleDeal(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: { slugs: string[]; itemPct: number; bundlePct: number; source: string; email?: string | null; userId?: string | null; expiresInDays?: number },
): Promise<string | null> {
  if (!opts.slugs.length) return null;
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 20; i++) token += alphabet[Math.floor(Math.random() * alphabet.length)];
  const expiresAt = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString() : null;

  const { error } = await admin.from("bundle_deals").insert({
    token,
    slugs: opts.slugs,
    item_pct: opts.itemPct,
    bundle_pct: opts.bundlePct,
    source: opts.source,
    email: opts.email || null,
    user_id: opts.userId || null,
    expires_at: expiresAt,
  });
  if (error) { console.error("[discount_codes] failed to mint bundle deal:", error); return null; }
  return token;
}
