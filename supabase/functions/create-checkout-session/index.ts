// supabase/functions/create-checkout-session/index.ts
//
// Deploy with:
//   supabase functions deploy create-checkout-session
//
// Required secrets (set once):
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set SITE_URL=https://vxpeinjected.github.io/coldd
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are the same
// three env vars already relied on by supabase/functions/email-otp.
//
// Guest checkout: signing in is optional. If the caller has a real session
// the order is tied to their user_id (so it shows up in their dashboard and
// they can re-download later); if not, orders.user_id is left null and Stripe
// collects the buyer's email itself. Either way, get-order-by-session and
// get-download-url can look the order up by Stripe session id alone, so a
// guest can still see + download from success.html right after paying.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const ALLOWED_ORIGIN = "https://vxpeinjected.github.io";
const RESELL_MULT = 3; // must match app.js's RESELL_MULT used in the cart/product-modal UI

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

type CartItem = { slug: string; qty: number; licence: "standard" | "resell" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL") ?? ALLOWED_ORIGIN;

    // Identify the caller from their own JWT if they're signed in - but signing
    // in is optional. A guest (no/invalid Authorization header) checks out with
    // orders.user_id left null; Stripe's own hosted page collects their email.
    let user: { id: string; email?: string | null } | null = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) user = userData.user;
    }

    const body = await req.json().catch(() => ({}));
    const items: CartItem[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ ok: false, error: "Your cart is empty." }, 400);
    if (items.length > 50) return json({ ok: false, error: "Too many items in one order." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const slugs = Array.from(new Set(items.map((i) => String(i.slug || ""))));
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, slug, title, price_usd, resell_available")
      .in("slug", slugs)
      .eq("is_active", true);
    if (prodErr) return json({ ok: false, error: "Could not load products." }, 500);

    const bySlug = new Map((products ?? []).map((p) => [p.slug, p]));

    // Never trust client-supplied prices or titles - everything below is
    // recomputed from the server's own products table.
    const lineItems: { title: string; unitPrice: number; qty: number; product: any; licence: string }[] = [];
    for (const raw of items) {
      const slug = String(raw.slug || "");
      const qty = Math.max(1, Math.min(20, Math.floor(Number(raw.qty) || 1)));
      const licence = raw.licence === "resell" ? "resell" : "standard";
      const product = bySlug.get(slug);
      if (!product) return json({ ok: false, error: `"${slug}" is no longer available.` }, 400);
      if (licence === "resell" && !product.resell_available) {
        return json({ ok: false, error: `${product.title} doesn't offer a resell licence.` }, 400);
      }
      const unitPrice = licence === "resell" ? Math.round(product.price_usd * RESELL_MULT) : Number(product.price_usd);
      lineItems.push({
        title: product.title + (licence === "resell" ? " (Resell licence)" : ""),
        unitPrice,
        qty,
        product,
        licence,
      });
    }

    const subtotal = lineItems.reduce((sum, li) => sum + li.unitPrice * li.qty, 0);
    if (subtotal <= 0) return json({ ok: false, error: "Order total must be greater than zero." }, 400);

    // Create the order + order_items as 'pending' before talking to Stripe,
    // so we have an order_id to hand to Stripe as metadata and correlate on
    // the webhook / success page.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user ? user.id : null,
        status: "pending",
        subtotal_usd: subtotal,
        discount_usd: 0,
        total_usd: subtotal,
      })
      .select()
      .single();
    if (orderErr || !order) return json({ ok: false, error: "Could not create order." }, 500);

    const { error: itemsErr } = await admin.from("order_items").insert(
      lineItems.map((li) => ({
        order_id: order.id,
        product_id: li.product.id,
        product_slug: li.product.slug,
        title: li.title,
        licence: li.licence,
        unit_price_usd: li.unitPrice,
        qty: li.qty,
      })),
    );
    if (itemsErr) {
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: "Could not create order items." }, 500);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2024-06-20",
    });

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(user?.email ? { customer_email: user.email } : {}),
        ...(user ? { client_reference_id: user.id } : {}),
        line_items: lineItems.map((li) => ({
          price_data: {
            currency: "usd",
            unit_amount: Math.round(li.unitPrice * 100),
            product_data: { name: li.title },
          },
          quantity: li.qty,
        })),
        success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout.html`,
        metadata: { order_id: order.id },
      });

      await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
      return json({ ok: true, url: session.url });
    } catch (stripeErr) {
      console.error("[create-checkout-session] stripe error:", stripeErr);
      await admin.from("orders").update({ status: "canceled" }).eq("id", order.id);
      return json({ ok: false, error: "Could not start checkout with Stripe." }, 500);
    }
  } catch (err) {
    console.error("[create-checkout-session] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
