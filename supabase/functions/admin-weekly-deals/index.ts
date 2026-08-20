// supabase/functions/admin-weekly-deals/index.ts
//
// Deploy with:
//   supabase functions deploy admin-weekly-deals --no-verify-jwt
//
// Required secret (set once):
//   supabase secrets set CRON_SECRET=<random-value>
//
// --no-verify-jwt is intentional, same reason as lock-check: the weekly
// cron job (pg_cron + pg_net, see the matching migration) calls this with
// no user session at all, just the CRON_SECRET header. Every other action
// (revert/exclude/include, and a manual "Run now" from the admin panel)
// carries a real admin JWT instead and is checked the normal way.
//
// Powers the homepage "This week's deals" grid: picks which products get
// discounted and by how much, writing straight to products.price_usd /
// was_price - the exact same fields the admin product editor's own "Was
// price" field already writes for a manual sale, so nothing downstream
// (catalog cards, checkout, cart) needs to know this ran at all.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// Product picked at a deeper discount converts better but earns less per
// unit - this is the tradeoff the scoring loop below searches over. Each
// 10 points of discount is modeled as roughly +15% conversion likelihood;
// not measured elasticity (there's no A/B data to fit one from yet), just
// a deliberately mild, explainable assumption so a bigger discount can
// still lose to a smaller one when the smaller one keeps more revenue per
// sale - it isn't a rule that says "always take the max discount".
const ELASTICITY = 1.5;
const MAX_DISCOUNT_PCT = 40;
const DISCOUNT_STEP_PCT = 5;
const PICK_COUNT = 4;
const LOOKBACK_DAYS = 30;

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  price_usd: number;
  was_price: number | null;
  weekly_deal_auto: boolean;
  weekly_deal_excluded: boolean;
  is_active: boolean;
};

async function revertAuto(admin: ReturnType<typeof createClient>, ids?: string[]) {
  let q = admin
    .from("products")
    .update({ weekly_deal: false, weekly_deal_auto: false, weekly_deal_pct: null })
    .eq("weekly_deal_auto", true);
  if (ids && ids.length) q = q.in("id", ids);
  const { data: toRevert } = await q.select("id, was_price");
  // price_usd/was_price need each row's own was_price, which .update()
  // can't reference per-row - a second pass per row is unavoidable here,
  // but this only ever runs over a handful of currently-discounted
  // products (PICK_COUNT is 4), never the whole catalog.
  for (const row of toRevert ?? []) {
    if (row.was_price != null) {
      await admin.from("products").update({ price_usd: row.was_price, was_price: null }).eq("id", row.id);
    }
  }
  return toRevert ?? [];
}

async function runAlgorithm(admin: ReturnType<typeof createClient>, actorName: string) {
  // Restore every currently algorithm-discounted product to its real price
  // first, so this always scores from true baseline prices - re-running
  // mid-week (the "Run now" button) can never compound a discount on top
  // of last run's discount.
  await revertAuto(admin);

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id, slug, title, price_usd, is_active, weekly_deal_excluded, product_legal(min_sale_usd, disallow_sales)")
    .eq("is_active", true);
  if (prodErr) throw new Error(prodErr.message);

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data: sales, error: salesErr } = await admin
    .from("order_items")
    .select("product_id, qty, orders!inner(status, created_at)")
    .eq("orders.status", "paid")
    .neq("licence", "resell")
    .gte("orders.created_at", since);
  if (salesErr) throw new Error(salesErr.message);

  const velocityByProduct = new Map<string, number>();
  for (const row of sales ?? []) {
    // deno-lint-ignore no-explicit-any
    const pid = (row as any).product_id as string;
    // deno-lint-ignore no-explicit-any
    const qty = Number((row as any).qty) || 0;
    velocityByProduct.set(pid, (velocityByProduct.get(pid) || 0) + qty / LOOKBACK_DAYS);
  }

  type Candidate = { id: string; slug: string; title: string; price: number; bestPct: number; bestScore: number; velocity: number };
  const candidates: Candidate[] = [];

  for (const p of (products ?? []) as unknown as Array<ProductRow & { product_legal: { min_sale_usd: number; disallow_sales: boolean } | { min_sale_usd: number; disallow_sales: boolean }[] | null }>) {
    if (p.weekly_deal_excluded) continue;
    const legalRaw = Array.isArray(p.product_legal) ? p.product_legal[0] : p.product_legal;
    if (legalRaw?.disallow_sales) continue;
    const price = Number(p.price_usd) || 0;
    if (price <= 0) continue;
    const velocity = velocityByProduct.get(p.id) || 0;
    if (velocity <= 0) continue; // nothing sold recently - no revenue signal to discount against

    const minSaleUsd = Number(legalRaw?.min_sale_usd) || 0;
    let maxPct = MAX_DISCOUNT_PCT;
    if (minSaleUsd > 0 && minSaleUsd < price) {
      const floorCapPct = Math.floor(100 * (1 - minSaleUsd / price));
      maxPct = Math.min(maxPct, floorCapPct);
    } else if (minSaleUsd >= price) {
      continue; // floor is at or above current price - no room to discount at all
    }
    if (maxPct < DISCOUNT_STEP_PCT) continue;

    let bestPct = 0, bestScore = -1;
    for (let pct = DISCOUNT_STEP_PCT; pct <= maxPct; pct += DISCOUNT_STEP_PCT) {
      const discPrice = price * (1 - pct / 100);
      const projected = discPrice * velocity * (1 + (pct / 100) * ELASTICITY);
      if (projected > bestScore) { bestScore = projected; bestPct = pct; }
    }
    if (bestPct > 0) candidates.push({ id: p.id, slug: p.slug, title: p.title, price, bestPct, bestScore, velocity });
  }

  candidates.sort((a, b) => b.bestScore - a.bestScore);
  const picks = candidates.slice(0, PICK_COUNT);

  for (const pick of picks) {
    const discPrice = Math.round(pick.price * (1 - pick.bestPct / 100) * 100) / 100;
    await admin.from("products").update({
      price_usd: discPrice,
      was_price: pick.price,
      weekly_deal: true,
      weekly_deal_auto: true,
      weekly_deal_pct: pick.bestPct,
    }).eq("id", pick.id);
  }

  await admin.from("admin_audit_log").insert({
    actor_id: null,
    actor_name: actorName,
    action: picks.length
      ? `Weekly deals: ${picks.map((p) => `${p.title} (-${p.bestPct}%)`).join(", ")}`
      : "Weekly deals: no eligible products found",
  });

  return picks.map((p) => ({ slug: p.slug, title: p.title, pct: p.bestPct }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const providedSecret = req.headers.get("x-cron-secret") || "";
    const isCron = cronSecret.length > 0 && providedSecret === cronSecret;

    let actorName = "system (weekly deals cron)";
    if (!isCron) {
      // Every non-cron action needs a real signed-in admin - the cron
      // secret only ever authorizes 'run', never exclude/include/revert.
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("is_admin, username")
        .eq("id", userData.user.id)
        .single();
      if (profileErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);
      actorName = profile.username || "admin";
    }

    if (action === "run") {
      const picks = await runAlgorithm(admin, isCron ? actorName : `${actorName} (manual run)`);
      return json({ ok: true, picks });
    }

    if (action === "revertAll") {
      if (isCron) return json({ ok: false, error: "Not permitted." }, 403);
      const reverted = await revertAuto(admin);
      await admin.from("admin_audit_log").insert({ actor_id: null, actor_name: actorName, action: `Reverted all ${reverted.length} weekly deal(s)` });
      return json({ ok: true, reverted: reverted.length });
    }

    if (action === "revert" || action === "exclude" || action === "include") {
      if (isCron) return json({ ok: false, error: "Not permitted." }, 403);
      const productId = String(body.productId || "");
      if (!productId) return json({ ok: false, error: "productId is required." }, 400);

      if (action === "revert") {
        await revertAuto(admin, [productId]);
        await admin.from("admin_audit_log").insert({ actor_id: null, actor_name: actorName, action: `Reverted weekly deal on product ${productId}` });
      } else if (action === "exclude") {
        await admin.from("products").update({ weekly_deal_excluded: true }).eq("id", productId);
        await revertAuto(admin, [productId]);
        await admin.from("admin_audit_log").insert({ actor_id: null, actor_name: actorName, action: `Excluded product ${productId} from weekly deals` });
      } else {
        await admin.from("products").update({ weekly_deal_excluded: false }).eq("id", productId);
        await admin.from("admin_audit_log").insert({ actor_id: null, actor_name: actorName, action: `Re-included product ${productId} in weekly deals` });
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[admin-weekly-deals] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
