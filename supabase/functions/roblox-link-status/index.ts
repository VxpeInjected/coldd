// supabase/functions/roblox-link-status/index.ts
//
// Deploy with:
//   supabase functions deploy roblox-link-status
//
// Returns whether the signed-in caller has a linked Roblox account, and
// their Roblox username if so. This is the only way the frontend can see
// link status - roblox_accounts has no client select policy, so tokens
// never reach the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasInventoryScope } from "../_shared/roblox.ts";

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
    const { data, error } = await admin
      .from("roblox_accounts")
      .select("roblox_username, scope")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (error) return json({ ok: false, error: "Could not check link status." }, 500);

    return json({
      ok: true,
      linked: !!data,
      robloxUsername: data ? data.roblox_username : null,
      // Robux checkout hard-requires this (see create-robux-order) - exposed
      // here too so the frontend can prompt a re-link before Place order
      // instead of only after a failed order-create call.
      hasInventoryScope: data ? hasInventoryScope(data.scope) : false,
    });
  } catch (err) {
    console.error("[roblox-link-status] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
