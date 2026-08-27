// supabase/functions/marketing-signup/index.ts
//
// Deploy with:
//   supabase functions deploy marketing-signup --no-verify-jwt
//
// Backs the site-wide "get 10% off for your email" popup - NOT the
// checkout marketing checkbox anymore (that one's consent-only, no
// incentive). Auth is optional: a signed-out visitor can claim a code
// just by typing an email; a signed-in one also gets
// profiles.notification_prefs.promotions synced so it shows up in their
// own Notifications settings.
//
// Re-submitting the same email returns the SAME code it already has
// (marketing_optins.discount_code) rather than minting a new one every
// time - otherwise the popup would be a free unlimited-code generator for
// anyone willing to resubmit the form.
//
// The code is also emailed to the address the visitor typed (best-effort
// via Resend - a send failure never fails the signup, since the popup
// already shows the code on screen). A repeat submission re-sends the
// existing code, which doubles as a "resend my code" path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mintOneTimeCoupon } from "../_shared/discount_codes.ts";
import { escapeHtml, sendSingle, wrapTransactionalEmail } from "../_shared/email.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const DISCOUNT_PCT = 10;
const CODE_VALID_DAYS = 14;

// Emails the discount code to the address the visitor typed. Best-effort:
// a Resend failure (or RESEND_API_KEY not set) must never fail the signup -
// the popup already shows the code on screen, this is just a copy for
// their inbox. `resend` softens the wording for a repeat request.
async function emailWelcomeCode(to: string, code: string, resend: boolean): Promise<void> {
  try {
    const intro = resend
      ? "Here's your coldd welcome code again."
      : `Thanks for joining - here's your ${DISCOUNT_PCT}% off coldd welcome code.`;
    const body = `
<p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${DISCOUNT_PCT}% off your order</p>
<p style="margin:0 0 24px;">${intro}</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
<tr><td align="center" style="background:#111111;border:1px solid #1a1a1a;border-radius:6px;padding:18px;">
<p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:700;letter-spacing:3px;color:#ff3344;">${escapeHtml(code)}</p>
</td></tr>
</table>
<p style="margin:0 0 24px;">Enter it at checkout to take ${DISCOUNT_PCT}% off. It works once${resend ? "" : `, and is valid for ${CODE_VALID_DAYS} days`}.</p>
<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(135deg,#cc0011 0%,#ff3344 100%);border-radius:6px;">
<a href="https://coldd.dev/assets" style="display:inline-block;padding:13px 26px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Browse the shop</a>
</td></tr></table>
`;
    // Code stays out of the subject - "...code: WELCOME-XYZ" reads as spam;
    // it's in the body where it belongs.
    await sendSingle(to, `Your ${DISCOUNT_PCT}% off coldd code`, wrapTransactionalEmail(body));
  } catch (err) {
    console.error("[marketing-signup] welcome code email failed:", err);
  }
}

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

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!validEmail(email)) return json({ ok: false, error: "Enter a real email address." }, 400);

    // Optional session - only used to sync notification_prefs for a
    // signed-in visitor. A guest claiming a code is completely normal here.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) userId = userData.user.id;
    }

    const { data: existing } = await admin.from("marketing_optins").select("discount_code").eq("email", email).maybeSingle();
    if (existing?.discount_code) {
      await emailWelcomeCode(email, existing.discount_code, true);
      return json({ ok: true, code: existing.discount_code, alreadySubscribed: true });
    }

    const code = await mintOneTimeCoupon(admin, { prefix: "WELCOME", pct: DISCOUNT_PCT, expiresInDays: CODE_VALID_DAYS });
    if (!code) return json({ ok: false, error: "Could not generate a code right now. Please try again." }, 500);

    await admin.from("marketing_optins").upsert({
      email,
      user_id: userId,
      source: "popup",
      subscribed_at: new Date().toISOString(),
      discount_code: code,
    });

    if (userId) {
      const { data: profile } = await admin.from("profiles").select("notification_prefs").eq("id", userId).maybeSingle();
      const prefs = Object.assign({}, profile?.notification_prefs || {}, { promotions: true });
      await admin.from("profiles").update({ notification_prefs: prefs }).eq("id", userId);
    }

    await emailWelcomeCode(email, code, false);

    return json({ ok: true, code, alreadySubscribed: false });
  } catch (err) {
    console.error("[marketing-signup] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
