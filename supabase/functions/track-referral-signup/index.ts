// supabase/functions/track-referral-signup/index.ts
//
// Deploy with:
//   supabase functions deploy track-referral-signup
//
// Called once, right after a brand-new account finishes signing up, if a
// ?ref=CODE was captured earlier in the session. Attributes the signup to
// the referrer (profiles.referred_by) - only if the caller doesn't
// already have a referrer set, and never to themselves.
//
// Body: { code }

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
    const code = String(body.code || "").trim().toLowerCase();
    if (!code) return json({ ok: false, error: "Missing code." }, 400);

    const { data: me } = await admin.from("profiles").select("id, referred_by").eq("id", userData.user.id).single();
    if (!me || me.referred_by) return json({ ok: true }); // already attributed, no-op

    const { data: referrer } = await admin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
    if (!referrer || referrer.id === userData.user.id) return json({ ok: true }); // unknown code or self-referral, silently ignore

    await admin.from("profiles").update({ referred_by: referrer.id }).eq("id", userData.user.id);
    return json({ ok: true });
  } catch (err) {
    console.error("[track-referral-signup] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
