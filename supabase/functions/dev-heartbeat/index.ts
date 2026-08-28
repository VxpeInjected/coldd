// supabase/functions/dev-heartbeat/index.ts
//
// Deploy with:
//   supabase functions deploy dev-heartbeat --no-verify-jwt
//
// Public "work is happening" ping for Developer Mode (see admin-dev-mode).
// The admin dashboard heartbeat only fires while a browser tab is open;
// this lets automated site work count too. On a valid ping it bumps
// site_status.dev_mode_active_at and, if Developer Mode is on and the
// site is in maintenance, flips it to open.
//
// Accepted callers (either is enough):
//   1. A GitHub push webhook - set the webhook secret to DEV_HEARTBEAT_SECRET,
//      content type application/json, event "push". Only pushes to main
//      count. Signature verified via X-Hub-Signature-256.
//   2. A manual ping with header  X-Dev-Key: <DEV_HEARTBEAT_SECRET>
//      (e.g. curl from a deploy script or a git hook).
//
// Without DEV_HEARTBEAT_SECRET set, every request is rejected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false }, 405);

  const secret = Deno.env.get("DEV_HEARTBEAT_SECRET");
  if (!secret) {
    console.error("[dev-heartbeat] DEV_HEARTBEAT_SECRET not set - rejecting");
    return json({ ok: false, error: "not configured" }, 401);
  }

  const raw = req.method === "POST" ? await req.text() : "";
  let authorized = false;
  let reason = "";

  // 1. Manual key header
  const devKey = req.headers.get("x-dev-key");
  if (devKey && timingSafeEqual(devKey, secret)) { authorized = true; reason = "key"; }

  // 2. GitHub push webhook signature
  if (!authorized) {
    const sig = req.headers.get("x-hub-signature-256"); // "sha256=<hex>"
    if (sig && sig.startsWith("sha256=")) {
      const expected = "sha256=" + await hmacHex(secret, raw);
      if (timingSafeEqual(sig, expected)) {
        // Only pushes to the default branch count as "site work".
        let ref = "";
        try { ref = String(JSON.parse(raw)?.ref || ""); } catch { /* ping event has no ref */ }
        const event = req.headers.get("x-github-event") || "";
        if (event === "ping") return json({ ok: true, pong: true });
        if (ref && ref !== "refs/heads/main") return json({ ok: true, ignored: "non-main push" });
        authorized = true; reason = "github";
      }
    }
  }

  if (!authorized) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cur } = await admin.from("site_status").select("dev_mode, mode").eq("id", true).maybeSingle();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { dev_mode_active_at: now, updated_at: now };
  let opened = false;
  if (cur?.dev_mode && cur?.mode === "maintenance") {
    patch.mode = "open";
    patch.maintenance_message = null;
    patch.maintenance_ends_at = null;
    opened = true;
  }
  await admin.from("site_status").update(patch).eq("id", true);

  return json({ ok: true, via: reason, devModeOn: !!cur?.dev_mode, opened });
});
