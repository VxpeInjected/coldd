// supabase/functions/_shared/coupon.ts
//
// Shared between validate-coupon and create-checkout-session so the two
// can never compute a different discount for the same cart - the amount
// shown to the shopper before payment must exactly match what Stripe
// actually charges.

export const RESELL_MULT = 3; // must match app.js's RESELL_MULT and create-checkout-session's

export type CartItem = { slug: string; qty: number; licence?: string };

export type PricedLine = {
  slug: string;
  title: string;
  unitPrice: number;
  qty: number;
  licence: string;
  platform: string;
  cat: string | null;
  productId: string;
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
    .select("id, slug, title, price_usd, resell_available, platform, cat")
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
    const unitPrice = licence === "resell" ? Math.round(product.price_usd * RESELL_MULT) : Number(product.price_usd);
    lines.push({
      slug,
      title: product.title + (licence === "resell" ? " (Resell licence)" : ""),
      unitPrice,
      qty,
      licence,
      platform: product.platform,
      cat: product.cat,
      productId: product.id,
    });
  }

  const subtotal = lines.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  return { ok: true, lines, subtotal };
}

export type CouponResolution =
  | { ok: true; code: string; discount: number; scopedSubtotal: number }
  | { ok: false; error: string };

// Resolves a coupon against an already-priced cart. discount is in whole
// dollars (matches subtotal_usd/discount_usd's numeric(10,2) columns) -
// callers going to Stripe convert to cents themselves.
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
  const scopedSubtotal = lines.filter(matches).reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
  if (scopedSubtotal <= 0) {
    return { ok: false, error: "That code doesn't apply to anything in your cart." };
  }

  const raw = coupon.type === "pct" ? scopedSubtotal * (Number(coupon.val) / 100) : Number(coupon.val);
  const discount = Math.round(Math.max(0, Math.min(raw, scopedSubtotal)) * 100) / 100;
  return { ok: true, code: coupon.code, discount, scopedSubtotal };
}
