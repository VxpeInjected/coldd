// supabase/functions/lookup-gift-recipient/index.ts
//
// Deploy with:
//   supabase functions deploy lookup-gift-recipient
//
// Checkout's "gift this order" flow: resolves a buyer-typed email or
// username to a real coldd account before checkout will let them proceed
// with the gift toggle on. Any signed-in caller can use this (not admin-
// only) - see admin-upsert-product/index.ts for the auth boilerplate this
// mirrors, minus the is_admin gate.
//
// Deliberately returns the minimum: { found, userId, displayName } and
// never the resolved account's email, even when the caller searched by
// email themselves - a username search must not become a way to fish out
// someone else's email address.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const query = String(body.query || "").trim();
    if (!query) return json({ ok: false, error: "Enter an email or username." }, 400);

    // Email is matched exactly (case-insensitive); username the same. Never
    // a partial/fuzzy match - this resolves ONE specific account the buyer
    // already knows, not a directory search.
    const isEmail = query.includes("@");
    const { data: profile } = await admin
      .from("profiles")
      .select("id, username, email")
      .ilike(isEmail ? "email" : "username", query)
      .maybeSingle();

    if (!profile) return json({ ok: true, found: false });

    if (profile.id === userData.user.id) {
      return json({ ok: false, error: "You can't gift an order to yourself." }, 400);
    }

    return json({
      ok: true,
      found: true,
      userId: profile.id,
      displayName: profile.username || (profile.email ? profile.email.split("@")[0] : "that user"),
    });
  } catch (err) {
    console.error("[lookup-gift-recipient] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
