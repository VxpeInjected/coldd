// supabase/functions/get-referral-code/index.ts
//
// Deploy with:
//   supabase functions deploy get-referral-code
//
// Returns the caller's referral code, generating and saving one on first
// use if they don't have one yet.
//
// Body: {} (auth only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeReferralCode } from "../_shared/referrals.ts";

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

    // profiles rows are created client-side (fire-and-forget upsert right
    // after signup, not a DB trigger), so there's no server-side guarantee
    // the row exists yet the first time this is called - self-heal instead
    // of hard-failing (same pattern as roblox-signin's inline profile
    // creation).
    let { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("referral_code, username, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profErr) return json({ ok: false, error: "Could not load profile." }, 500);
    if (!profile) {
      const email = userData.user.email || "";
      const username = (userData.user.user_metadata && (userData.user.user_metadata.username || userData.user.user_metadata.full_name || userData.user.user_metadata.name)) || (email ? email.split("@")[0] : "Member");
      const { data: created, error: createErr } = await admin
        .from("profiles")
        .upsert({ id: userData.user.id, username, email, updated_at: new Date().toISOString() })
        .select("referral_code, username, email")
        .single();
      if (createErr || !created) return json({ ok: false, error: "Could not load profile." }, 500);
      profile = created;
    }

    if (profile.referral_code) return json({ ok: true, code: profile.referral_code });

    const seed = profile.username || (profile.email ? profile.email.split("@")[0] : "user");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeReferralCode(seed);
      const { error: upErr } = await admin.from("profiles").update({ referral_code: code }).eq("id", userData.user.id);
      if (!upErr) return json({ ok: true, code });
      // Unique violation (collision) - try again with a new random suffix.
    }
    return json({ ok: false, error: "Could not generate a referral code, please try again." }, 500);
  } catch (err) {
    console.error("[get-referral-code] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
