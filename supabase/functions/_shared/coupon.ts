// supabase/functions/_shared/coupon.ts
//
// Shared between validate-coupon and create-checkout-session so the two
// can never compute a different discount for the same cart - the amount
// shown to the shopper before payment must exactly match what Stripe
// actually charges.

export const RESELL_MULT = 3; // must match app.js's RESELL_MULT and create-checkout-session's

export const CROSS_SELL_PCT = 10; // must match app.js's checkout cross-sell offer text

export type CartItem = { slug: string; qty: number; licence?: string; crossSell?: boolean };

export type PricedLine = {
  slug: string;
  title: string;
  unitPrice: number;
  qty: number;
  licence: string;
  platform: string;
  cat: string | null;
  productId: string;
  // Legal floor for this product (product_legal.min_sale_usd - the price
  // the underlying license/reseller agreement forbids going below), and
  // whether the product is barred from any discount at all
  // (product_legal.disallow_sales). Both default open (0 / false) for a
  // product with no product_legal row, same as every other reader of
  // that table in this codebase (admin-weekly-deals, admin-upsert-product).
  minSaleUsd: number;
  disallowSales: boolean;
};

export async function priceItems(
  admin: any,
  items: CartItem[],
): Promise<{ ok: true; lines: PricedLine[]; subtotal: number } | { ok: false; error: string }> {
  if (!items.length) return { ok: false, error: "Your cart is empty." };
  if (items.length > 50) return { ok: false, error: "Too many items in one order." };

  const slugs = Array.from(new Set(items.map((i) => String(i.slug || ""))));
  const { data: products, error } = await admin
    .from("products")
    .select("id, slug, title, price_usd, resell_available, platform, cat, product_legal(min_sale_usd, disallow_sales)")
    .in("slug", slugs)
    .eq("is_active", true);
  if (error) return { ok: false, error: "Could not load products." };

  const bySlug = new Map((products ?? []).map((p: any) => [p.slug, p]));
  const lines: PricedLine[] = [];
  for (const raw of items) {
    const slug = String(raw.slug || "");
    const qty = Math.max(1, Math.min(20, Math.floor(Number(raw.qty) || 1)));
    const licence = raw.licence === "resell" ? "resell" : "standard";
    const product = bySlug.get(slug);
    if (!product) return { ok: false, error: `"${slug}" is no longer available.` };
    if (licence === "resell" && !product.resell_available) {
      return { ok: false, error: `${product.title} doesn't offer a resell licence.` };
    }
    const baseUnitPrice = licence === "resell" ? Math.round(product.price_usd * RESELL_MULT) : Number(product.price_usd);
    const legalRaw = Array.isArray(product.product_legal) ? product.product_legal[0] : product.product_legal;
    const minSaleUsd = Number(legalRaw?.min_sale_usd) || 0;
    const disallowSales = !!legalRaw?.disallow_sales;
    // The checkout cross-sell upsell ("people also get this") bakes its
    // discount straight into the line price rather than the order-level
    // discount_usd a coupon/marketing-optin uses - it's a special price on
    // a specific item being added right now, not a reduction applied
    // across the whole order. Same floor rule as every other discount
    // path: never below min_sale_usd, and disallow_sales means no
    // discount at all (the item can still be added, just at full price).
    let unitPrice = baseUnitPrice;
    let isCrossSellDeal = false;
    if (raw.crossSell && !disallowSales) {
      const discounted = Math.round(baseUnitPrice * (1 - CROSS_SELL_PCT / 100) * 100) / 100;
      const floored = minSaleUsd > 0 ? Math.max(discounted, minSaleUsd) : discounted;
      if (floored < baseUnitPrice) { unitPrice = floored; isCrossSellDeal = true; }
    }
    lines.push({
      slug,
      title: product.title + (licence === "resell" ? " (Resell licence)" : "") + (isCrossSellDeal ? ` (${CROSS_SELL_PCT}% off)` : ""),
      unitPrice,
      qty,
      licence,
      platform: product.platform,
      cat: product.cat,
      productId: product.id,
      minSaleUsd,
      disallowSales,
    });
  }

  const subtotal = lines.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  return { ok: true, lines, subtotal };
}

// Total dollars every line in `lines` could legally give up before any one
// of them drops under its own product_legal.min_sale_usd floor - shared by
// every discount path below (coupons, the marketing opt-in discount, the
// checkout cross-sell upsell) so they all answer "how far can this go" the
// same way. disallow_sales lines contribute zero, same as everywhere else
// that field is read.
export function legalHeadroom(lines: PricedLine[]): number {
  return lines
    .filter((li) => !li.disallowSales)
    .reduce((sum, li) => sum + Math.max(0, li.unitPrice - li.minSaleUsd) * li.qty, 0);
}

// A flat percentage off, used by the checkout "get 10% off" marketing
// opt-in and the genre cross-sell upsell - same floor-respecting cap as a
// coupon, just without a code to look up.
export function flatPctDiscount(lines: PricedLine[], pct: number): { discount: number; capped: boolean } {
  const eligible = lines.filter((li) => !li.disallowSales);
  const eligibleSubtotal = eligible.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  const raw = eligibleSubtotal * (pct / 100);
  const headroom = legalHeadroom(lines);
  const cap = Math.round(Math.min(raw, headroom) * 100) / 100;
  const discount = Math.max(0, cap);
  return { discount, capped: discount < Math.round(raw * 100) / 100 };
}

// Re-clamps a coupon discount plus a marketing-optin discount together,
// since each is independently capped against the SAME headroom - stacked
// without this, their sum could still legally overshoot a floor even
// though neither one alone did.
export function clampCombinedDiscount(lines: PricedLine[], totalRawDiscount: number): number {
  const headroom = legalHeadroom(lines);
  const subtotal = lines.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  return Math.round(Math.max(0, Math.min(totalRawDiscount, headroom, subtotal)) * 100) / 100;
}

export type CouponResolution =
  | { ok: true; code: string; discount: number; scopedSubtotal: number; note?: string }
  | { ok: false; error: string };

// Resolves a coupon against an already-priced cart. discount is in whole
// dollars (matches subtotal_usd/discount_usd's numeric(10,2) columns) -
// callers going to Stripe convert to cents themselves.
//
// Every discount path in this file - coupons here, the checkout cross-sell
// upsell, the marketing-signup code - has to respect product_legal's
// min_sale_usd (the floor the underlying license/reseller agreement sets)
// and disallow_sales (no discount at all, ever). A coupon is never scoped
// to just the products it can legally discount, so rather than reject the
// whole code the moment ANY line in scope can't take the full discount,
// this caps the total to whatever every eligible line can still legally
// absorb and says so in `note` - the code still does something, it just
// doesn't pretend a product can go below a price it's contractually not
// allowed to.
export async function resolveCoupon(admin: any, rawCode: string, lines: PricedLine[]): Promise<CouponResolution> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code." };

  const { data: coupon, error } = await admin.from("coupons").select("*").eq("code", code).maybeSingle();
  if (error) return { ok: false, error: "Could not check that code." };
  if (!coupon || !coupon.active) return { ok: false, error: "That code is invalid or no longer active." };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { ok: false, error: "That code has expired." };
  }
  if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
    return { ok: false, error: "That code has reached its usage limit." };
  }

  const matches = (li: PricedLine) => {
    if (coupon.scope === "platform") return li.platform === coupon.platform;
    if (coupon.scope === "category") return li.platform === coupon.platform && li.cat === coupon.category;
    return true; // sitewide
  };
  const scopedLines = lines.filter(matches);
  const scopedSubtotal = scopedLines.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  if (scopedSubtotal <= 0) {
    return { ok: false, error: "That code doesn't apply to anything in your cart." };
  }

  // disallow_sales lines take zero discount and don't count toward scope at
  // all (matches admin-weekly-deals treating them as fully off-limits, not
  // just capped) - a code can still apply to the rest of the cart around
  // them.
  const eligibleLines = scopedLines.filter((li) => !li.disallowSales);
  const eligibleSubtotal = eligibleLines.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  if (eligibleSubtotal <= 0) {
    return { ok: false, error: "That code doesn't apply to anything discountable in your cart." };
  }
  // How much every eligible (in-scope) line could give up in total before
  // any single one drops under its own floor - a line with no floor set
  // can absorb its whole price, same as before this check existed. Scoped
  // to just this coupon's matching lines, not legalHeadroom(lines) above
  // (that one's sitewide, for the marketing-optin discount).
  const couponHeadroom = eligibleLines.reduce((sum, li) => sum + Math.max(0, li.unitPrice - li.minSaleUsd) * li.qty, 0);

  const raw = coupon.type === "pct" ? scopedSubtotal * (Number(coupon.val) / 100) : Number(coupon.val);
  const cap = Math.min(scopedSubtotal, eligibleSubtotal, couponHeadroom);
  const discount = Math.round(Math.max(0, Math.min(raw, cap)) * 100) / 100;
  const wasCapped = discount < Math.round(Math.min(raw, scopedSubtotal) * 100) / 100;
  return {
    ok: true,
    code: coupon.code,
    discount,
    scopedSubtotal,
    note: wasCapped ? "Applied at the largest discount your cart currently qualifies for." : undefined,
  };
}
