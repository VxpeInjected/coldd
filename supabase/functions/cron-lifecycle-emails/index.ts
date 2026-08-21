// supabase/functions/cron-lifecycle-emails/index.ts
//
// Deploy with:
//   supabase functions deploy cron-lifecycle-emails --no-verify-jwt
//
// Called on a schedule by pg_cron/pg_net (see lifecycle_emails_cron.sql),
// not by a user - verifies a shared secret header instead of a Supabase
// JWT, same pattern as every other cron-invoked function in this codebase.
//
// Replaces cron-abandoned-cart-emails (single-step, hardcoded copy) with
// three admin-configurable automations, all driven by the
// email_automations table an admin edits from the Marketing panel -
// nothing here is hardcoded copy or timing, so a config change takes
// effect on the next tick with no deploy. Each automation is independently
// enabled/disabled; a disabled row is skipped entirely, including its
// per-recipient bookkeeping (so re-enabling later doesn't fire off a
// backlog of everything that would have sent while it was off).
//
// 1. ABANDONED CART (abandoned_cart_1/2/3) - a 3-step sequence over
//    cart_snapshots. abandoned_step_sent tracks progress per cart (0 = none
//    sent). Each run advances at most one step per cart, in order - a cart
//    can't skip from step 0 straight to step 3 even if the cron job were
//    down for days, since sending step 2 requires abandoned_step_sent = 1
//    already. The row disappearing (real purchase, or cart emptied) is
//    itself what stops the sequence - no separate check needed.
//
// 2. POST-PURCHASE REVIEW (post_purchase_review) - one email per paid
//    order, delay_hours after paid_at, linking to that order's items with
//    the same ?tab=reviews deep link the dashboard's own Review buttons use.
//
// 3. RE-ENGAGEMENT (reengagement) - one email per account whose last paid
//    order (or account creation, if they never bought) is older than
//    delay_hours, sent once (reengagement_email_sent_at gates repeats).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ctaButtonHtml, emailConfigured, itemsTableHtml, renderAutomationEmail, sendSingle } from "../_shared/email.ts";
import { mintOneTimeCoupon, mintBundleDeal } from "../_shared/discount_codes.ts";

const MAX_PER_AUTOMATION = 50;
const SITE_URL = "https://coldd.dev";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Config = { key: string; enabled: boolean; delay_hours: number; subject: string; body_md: string };

Deno.serve(async (req: Request) => {
  try {
    const cronSecret = Deno.env.get("LIFECYCLE_CRON_SECRET");
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
      return json({ ok: false, error: "Unauthorized." }, 401);
    }

    if (!emailConfigured()) return json({ ok: true, skipped: true, reason: "RESEND_API_KEY not set" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: configRows } = await admin.from("email_automations").select("*");
    const configs = new Map<string, Config>((configRows || []).map((c: Config) => [c.key, c]));

    const results = {
      abandonedCart: await runAbandonedCart(admin, configs, supabaseUrl),
      postPurchase: await runPostPurchaseReview(admin, configs.get("post_purchase_review"), supabaseUrl),
      reengagement: await runReengagement(admin, configs.get("reengagement"), supabaseUrl),
      wishlistReminder: await runWishlistReminder(admin, configs.get("wishlist_reminder"), supabaseUrl),
    };

    return json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron-lifecycle-emails] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function eligibleProfile(admin: any, userId: string): Promise<{ email: string; email_unsub_token: string; hasMarketingOptIn: boolean } | null> {
  const { data } = await admin
    .from("profiles")
    .select("email, email_unsub_token, marketing_unsubscribed, banned, notification_prefs")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.email || data.marketing_unsubscribed || data.banned) return null;
  return { email: data.email, email_unsub_token: data.email_unsub_token, hasMarketingOptIn: !!data.notification_prefs?.promotions };
}

// deno-lint-ignore no-explicit-any
async function runAbandonedCart(admin: any, configs: Map<string, Config>, supabaseUrl: string) {
  const steps = [1, 2, 3].map((n) => configs.get(`abandoned_cart_${n}`)).filter(Boolean) as Config[];
  if (!steps.some((s) => s.enabled)) return { sent: 0, skipped: 0 };

  const { data: carts } = await admin
    .from("cart_snapshots")
    .select("session_id, user_id, items, updated_at, abandoned_step_sent, discount_code")
    .not("user_id", "is", null)
    .lt("abandoned_step_sent", 3)
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_AUTOMATION);

  let sent = 0, skipped = 0;
  for (const cart of carts || []) {
    const ageHours = (Date.now() - new Date(cart.updated_at).getTime()) / 3_600_000;
    const nextStepNum = cart.abandoned_step_sent + 1;
    const step = steps.find((s) => Number(s.key.slice(-1)) === nextStepNum);
    if (!step || !step.enabled || ageHours < step.delay_hours) continue;

    const prof = await eligibleProfile(admin, cart.user_id);
    if (!prof) { skipped++; await admin.from("cart_snapshots").update({ abandoned_step_sent: nextStepNum }).eq("session_id", cart.session_id); continue; }

    const items = Array.isArray(cart.items)
      ? cart.items.map((i: { title?: string; qty?: number }) => ({ title: String(i.title || "Item"), qty: Number(i.qty) || 1 }))
      : [];
    if (!items.length) { skipped++; await admin.from("cart_snapshots").update({ abandoned_step_sent: nextStepNum }).eq("session_id", cart.session_id); continue; }

    // Steps 2/3 carry a real discount - only for someone who's actually
    // opted into marketing (a plain "your cart's still here" nudge is
    // defensible without that, a discount offer is unambiguously
    // promotional). Everyone else still gets the same reminder, just
    // without a code attached. The SAME code is reused for step 3 if step
    // 2 already minted one, rather than a new one each time.
    let discountCode: string | null = cart.discount_code || null;
    const updatePayload: Record<string, unknown> = { abandoned_step_sent: nextStepNum };
    if (nextStepNum >= 2 && prof.hasMarketingOptIn && !discountCode) {
      discountCode = await mintOneTimeCoupon(admin, { prefix: "CART", pct: nextStepNum === 2 ? 10 : 15, expiresInDays: 7 });
      if (discountCode) updatePayload.discount_code = discountCode;
    }

    const extraBlocks = [itemsTableHtml(items)];
    if (nextStepNum >= 2 && discountCode) {
      extraBlocks.push(`<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#d7d7d7;">Use code <strong style="color:#ff3344;letter-spacing:0.03em;">${discountCode}</strong> at checkout.</p>`);
    }
    extraBlocks.push(ctaButtonHtml(`${SITE_URL}/checkout`, "Finish checkout"));

    const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?t=${prof.email_unsub_token}`;
    const html = renderAutomationEmail(step.body_md, extraBlocks, unsubscribeUrl);
    const result = await sendSingle(prof.email, step.subject, html);
    if (result.ok) sent++; else console.error("[cron-lifecycle-emails] abandoned-cart send failed:", result.error);
    await admin.from("cart_snapshots").update(updatePayload).eq("session_id", cart.session_id);
  }
  return { sent, skipped };
}

// deno-lint-ignore no-explicit-any
async function runPostPurchaseReview(admin: any, config: Config | undefined, supabaseUrl: string) {
  if (!config || !config.enabled) return { sent: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - config.delay_hours * 3_600_000).toISOString();
  const { data: orders } = await admin
    .from("orders")
    .select("id, user_id, paid_at")
    .eq("status", "paid")
    .is("review_email_sent_at", null)
    .not("user_id", "is", null)
    .lt("paid_at", cutoff)
    .limit(MAX_PER_AUTOMATION);

  let sent = 0, skipped = 0;
  for (const order of orders || []) {
    const prof = await eligibleProfile(admin, order.user_id);
    if (!prof) { skipped++; await admin.from("orders").update({ review_email_sent_at: new Date().toISOString() }).eq("id", order.id); continue; }

    const { data: items } = await admin.from("order_items").select("title, product_slug, qty").eq("order_id", order.id);
    const lineItems = (items || []).map((i: { title: string; product_slug: string; qty: number }) => ({
      title: i.title,
      qty: i.qty,
      linkUrl: i.product_slug ? `${SITE_URL}/product?id=${encodeURIComponent(i.product_slug)}&tab=reviews` : undefined,
      linkLabel: "Leave a review",
    }));
    if (!lineItems.length) { skipped++; await admin.from("orders").update({ review_email_sent_at: new Date().toISOString() }).eq("id", order.id); continue; }

    const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?t=${prof.email_unsub_token}`;
    const html = renderAutomationEmail(config.body_md, [itemsTableHtml(lineItems)], unsubscribeUrl);
    const result = await sendSingle(prof.email, config.subject, html);
    if (result.ok) sent++; else console.error("[cron-lifecycle-emails] review-request send failed:", result.error);
    await admin.from("orders").update({ review_email_sent_at: new Date().toISOString() }).eq("id", order.id);
  }
  return { sent, skipped };
}

// deno-lint-ignore no-explicit-any
async function runReengagement(admin: any, config: Config | undefined, supabaseUrl: string) {
  if (!config || !config.enabled) return { sent: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - config.delay_hours * 3_600_000).toISOString();
  const { data: candidates } = await admin
    .from("profiles")
    .select("id, email, email_unsub_token, marketing_unsubscribed, banned, created_at")
    .eq("marketing_unsubscribed", false)
    .is("reengagement_email_sent_at", null)
    .not("email", "is", null)
    .lt("created_at", cutoff)
    .limit(MAX_PER_AUTOMATION * 3); // over-fetch, some get filtered below by recent-order

  const pool = (candidates || []).filter((p: { banned?: boolean }) => !p.banned).slice(0, MAX_PER_AUTOMATION * 3);
  if (!pool.length) return { sent: 0, skipped: 0 };

  const ids = pool.map((p: { id: string }) => p.id);
  const { data: recentOrders } = await admin
    .from("orders")
    .select("user_id")
    .eq("status", "paid")
    .gte("paid_at", cutoff)
    .in("user_id", ids);
  const recentBuyers = new Set((recentOrders || []).map((o: { user_id: string }) => o.user_id));

  let sent = 0, skipped = 0;
  for (const prof of pool) {
    if (sent >= MAX_PER_AUTOMATION) break;
    if (recentBuyers.has(prof.id)) continue; // still active - not lapsed, leave sent_at null for a future check

    const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?t=${prof.email_unsub_token}`;
    const html = renderAutomationEmail(config.body_md, [ctaButtonHtml(`${SITE_URL}/assets`, "See what's new")], unsubscribeUrl);
    const result = await sendSingle(prof.email, config.subject, html);
    if (result.ok) sent++; else { skipped++; console.error("[cron-lifecycle-emails] reengagement send failed:", result.error); }
    await admin.from("profiles").update({ reengagement_email_sent_at: new Date().toISOString() }).eq("id", prof.id);
  }
  return { sent, skipped };
}

// WISHLIST REMINDER (wishlist_reminder) - one per account with wishlist
// items sitting untouched for delay_hours, offering each at item_pct off
// (bundle_pct more if every one shown is bought together), same
// per-user bundle_deals mechanism the post-purchase upsell uses. Unlike
// the abandoned-cart plain-reminder step, this ALWAYS carries a
// discount - there's no non-promotional version of "here's a nudge about
// something you never even started buying" - so it requires real
// marketing consent, no exceptions, rather than just being opt-out.
const WISHLIST_ITEM_PCT = 12;
const WISHLIST_BUNDLE_PCT = 8;

// deno-lint-ignore no-explicit-any
async function runWishlistReminder(admin: any, config: Config | undefined, supabaseUrl: string) {
  if (!config || !config.enabled) return { sent: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - config.delay_hours * 3_600_000).toISOString();
  const { data: rows } = await admin
    .from("wishlist_items")
    .select("user_id, product_id, created_at, products(slug, title, price_usd, image)")
    .is("reminder_sent_at", null)
    .lt("created_at", cutoff)
    .limit(MAX_PER_AUTOMATION * 4); // over-fetch: several rows can belong to one user

  // deno-lint-ignore no-explicit-any
  const byUser = new Map<string, any[]>();
  for (const row of rows || []) {
    if (!row.products) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }
  if (!byUser.size) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;
  for (const [userId, userRows] of byUser) {
    if (sent >= MAX_PER_AUTOMATION) break;

    const prof = await eligibleProfile(admin, userId);
    const productIds = userRows.map((r) => r.product_id);
    if (!prof || !prof.hasMarketingOptIn) {
      skipped++;
      // Not eligible for a discount-bearing email at all - stop
      // re-checking these specific rows every run, but this is a
      // permanent skip, not "try again later", so sent_at is set the
      // same as a real send would.
      await admin.from("wishlist_items").update({ reminder_sent_at: new Date().toISOString() }).eq("user_id", userId).in("product_id", productIds);
      continue;
    }

    // Drop anything they've since actually bought - a wishlist item that
    // already converted isn't a reminder candidate any more.
    const { data: owned } = await admin
      .from("order_items")
      .select("product_id, orders!inner(user_id, status)")
      .eq("orders.user_id", userId)
      .eq("orders.status", "paid")
      .in("product_id", productIds);
    // deno-lint-ignore no-explicit-any
    const ownedIds = new Set((owned || []).map((o: any) => o.product_id));
    const stillWanted = userRows.filter((r) => !ownedIds.has(r.product_id));

    if (!stillWanted.length) {
      await admin.from("wishlist_items").update({ reminder_sent_at: new Date().toISOString() }).eq("user_id", userId).in("product_id", productIds);
      continue;
    }

    // deno-lint-ignore no-explicit-any
    const slugs: string[] = stillWanted.map((r: any) => r.products.slug);
    const token = await mintBundleDeal(admin, {
      slugs,
      itemPct: WISHLIST_ITEM_PCT,
      bundlePct: WISHLIST_BUNDLE_PCT,
      source: "wishlist_reminder",
      userId,
      email: prof.email,
      expiresInDays: 7,
    });
    if (!token) { skipped++; continue; }

    // deno-lint-ignore no-explicit-any
    const lineItems = stillWanted.map((r: any) => ({ title: r.products.title }));
    const discountNote = `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#d7d7d7;">${WISHLIST_ITEM_PCT}% off each, or ${WISHLIST_ITEM_PCT + WISHLIST_BUNDLE_PCT}% off if you get all ${stillWanted.length}. This applies automatically at checkout - no code needed.</p>`;
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?t=${prof.email_unsub_token}`;
    const html = renderAutomationEmail(
      config.body_md,
      [itemsTableHtml(lineItems), discountNote, ctaButtonHtml(`${SITE_URL}/dashboard?panel=wishlist&bundle=${token}`, "See your wishlist")],
      unsubscribeUrl,
    );
    const result = await sendSingle(prof.email, config.subject, html);
    if (result.ok) sent++; else { skipped++; console.error("[cron-lifecycle-emails] wishlist-reminder send failed:", result.error); }
    await admin.from("wishlist_items").update({ reminder_sent_at: new Date().toISOString() }).eq("user_id", userId).in("product_id", productIds);
  }
  return { sent, skipped };
}
