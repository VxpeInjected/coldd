// supabase/functions/delete-account/index.ts
//
// Deploy with:
//   supabase functions deploy delete-account
//
// Deletes the CALLING user's own account only - identified via their own
// JWT, never a client-supplied id. Uses the service role internally
// (auto-provided, never exposed to the client) since user deletion
// requires admin privileges.
//
// deleteUser() itself only removes what a foreign key to auth.users can
// cascade or null out - profiles/reviews/roblox_accounts cascade away
// correctly, but three tables (marketing_optins, cart_snapshots,
// bundle_deals) store the person's actual email address in its own
// column, not derived from the auth row, so nulling user_id there leaves
// a fully identifiable, permanent record behind. Cleaned up explicitly
// here, before the account itself goes, while we still have the email
// to match on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://coldd.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Not authenticated." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = userData.user.id;
    const email = userData.user.email;

    // Errors here are logged, not thrown - a failed cleanup row must
    // never block the actual account deletion the person asked for.
    // Matched by user_id where available and by email for
    // marketing_optins, whose primary key IS the email address (user_id
    // there is only ever a secondary link).
    const { error: cartErr } = await admin.from("cart_snapshots").delete().eq("user_id", userId);
    if (cartErr) console.error("[delete-account] cart_snapshots cleanup failed:", cartErr.message);
    const { error: bundleErr } = await admin.from("bundle_deals").delete().eq("user_id", userId);
    if (bundleErr) console.error("[delete-account] bundle_deals cleanup failed:", bundleErr.message);
    if (email) {
      const { error: mktErr } = await admin.from("marketing_optins").delete().eq("email", email);
      if (mktErr) console.error("[delete-account] marketing_optins cleanup failed:", mktErr.message);
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ ok: false, error: delErr.message }, 500);

    return json({ ok: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
