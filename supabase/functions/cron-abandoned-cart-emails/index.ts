// supabase/functions/cron-abandoned-cart-emails/index.ts
//
// Deploy with:
//   supabase functions deploy cron-abandoned-cart-emails --no-verify-jwt
//
// Called on a schedule by pg_cron/pg_net (see abandoned_cart_cron.sql), not
// by a user - verifies a shared secret header instead of a Supabase JWT,
// same pattern as roblox-cookie-healthcheck / discord-member-snapshot.
//
// A cart_snapshots row only exists while a cart is genuinely abandoned -
// save-cart-snapshot deletes it the moment the cart empties, and it's
// deleted again once a real order is created (see create-checkout-session /
// create-robux-order). So any row here older than the cutoff, not yet
// emailed, is a real abandoned cart by construction - no need to re-check
// against orders.
//
// Only emails snapshots with a user_id (a signed-in shopper whose profile
// we can check for marketing_unsubscribed) - guest checkouts leave an email
// on the snapshot too, but emailing someone who never made an account
// stretches past the "every account is opted in" consent model this was
// built under, so those are skipped rather than guessed about.
//
// No server-side cart restore exists, so the recovery link points at
// /checkout generally rather than a specific pre-filled cart - the cart
// itself lives in the shopper's own browser storage, which this email
// can't reach.
//
// Required secret: ABANDONED_CART_CRON_SECRET - must match the header
// value the cron job sends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { abandonedCartEmail, emailConfigured, sendSingle } from "../_shared/email.ts";

const CUTOFF_HOURS = 2;
const MAX_PER_RUN = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const cronSecret = Deno.env.get("ABANDONED_CART_CRON_SECRET");
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
      return json({ ok: false, error: "Unauthorized." }, 401);
    }

    if (!emailConfigured()) return json({ ok: true, skipped: true, reason: "RESEND_API_KEY not set" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000).toISOString();

    const { data: carts, error: cartsErr } = await admin
      .from("cart_snapshots")
      .select("session_id, user_id, items")
      .lt("updated_at", cutoff)
      .is("abandoned_email_sent_at", null)
      .not("user_id", "is", null)
      .limit(MAX_PER_RUN);
    if (cartsErr) {
      console.error("[cron-abandoned-cart-emails] load carts failed:", cartsErr.message);
      return json({ ok: false, error: "Could not load abandoned carts." }, 500);
    }
    if (!carts || !carts.length) return json({ ok: true, sent: 0, skipped: 0 });

    const userIds = Array.from(new Set(carts.map((c) => c.user_id)));
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, marketing_unsubscribed, email_unsub_token, banned")
      .in("id", userIds);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));

    let sent = 0;
    let skipped = 0;

    for (const cart of carts) {
      const prof = byId.get(cart.user_id as string);
      // Mark handled either way - a cart with no eligible profile (opted
      // out, banned, no email) is never going to become eligible later, so
      // leaving abandoned_email_sent_at null would just re-check it forever.
      if (!prof || !prof.email || prof.marketing_unsubscribed || prof.banned) {
        skipped++;
        await admin.from("cart_snapshots").update({ abandoned_email_sent_at: new Date().toISOString() }).eq("session_id", cart.session_id);
        continue;
      }

      const items = Array.isArray(cart.items)
        ? cart.items.map((i: { title?: string; qty?: number }) => ({ title: String(i.title || "Item"), qty: Number(i.qty) || 1 }))
        : [];
      if (!items.length) {
        skipped++;
        await admin.from("cart_snapshots").update({ abandoned_email_sent_at: new Date().toISOString() }).eq("session_id", cart.session_id);
        continue;
      }

      const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?t=${prof.email_unsub_token}`;
      const { subject, html } = abandonedCartEmail(items, "https://coldd.dev/checkout", unsubscribeUrl);
      const result = await sendSingle(prof.email, subject, html);

      if (result.ok) sent++; else console.error("[cron-abandoned-cart-emails] send failed for", cart.session_id, result.error);
      await admin.from("cart_snapshots").update({ abandoned_email_sent_at: new Date().toISOString() }).eq("session_id", cart.session_id);
    }

    return json({ ok: true, sent, skipped });
  } catch (err) {
    console.error("[cron-abandoned-cart-emails] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
