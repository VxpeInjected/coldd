// supabase/functions/email-unsubscribe/index.ts
//
// Deploy with:
//   supabase functions deploy email-unsubscribe --no-verify-jwt
//
// Public, no session required - an unsubscribe link in an email client has
// to work whether or not the recipient is signed in on that device. Auth is
// the token itself (profiles.email_unsub_token, a random uuid per account),
// not a Supabase JWT.
//
//   GET  ?t=<token>  - shows a small branded confirm page with a button.
//                      Does NOT change anything. A plain GET must be safe:
//                      inbox link-scanners, "open in new tab" prefetch and
//                      corporate URL-rewriters all fetch links, and a GET
//                      that mutated state would unsubscribe people who never
//                      clicked.
//   POST ?t=<token>  - actually sets marketing_unsubscribed. This is both
//                      the confirm-page button target AND the RFC 8058
//                      one-click endpoint that Gmail/Yahoo POST to (body
//                      `List-Unsubscribe=One-Click`), paired with the
//                      List-Unsubscribe / List-Unsubscribe-Post headers set
//                      in _shared/email.ts (unsubscribeHeaders).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function page(body: string, status = 200) {
  const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unsubscribe - coldd</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#d7d7d7;">
<div style="max-width:420px;margin:80px auto;padding:36px 32px;background:#0b0b0b;border:1px solid #1a1a1a;border-radius:8px;text-align:center;">
<p style="margin:0 0 6px;font-size:9px;letter-spacing:4px;color:#ff3344;text-transform:uppercase;font-weight:700;">coldd Development</p>
${body}
</div>
</body></html>`;
  return new Response(doc, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const token = new URL(req.url).searchParams.get("t");
    if (!token) {
      return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Missing unsubscribe link.</p>`, 400);
    }
    // email_unsub_token is a uuid column - a non-uuid `t` (bots, truncated
    // links) would otherwise throw a Postgres 22P02 and surface as a 500.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">That link is invalid.</p>`, 404);
    }

    // GET - show the confirm button, change nothing.
    if (req.method === "GET") {
      const action = `${new URL(req.url).pathname}?t=${encodeURIComponent(token)}`;
      return page(`<p style="margin:14px 0 4px;font-size:18px;color:#ffffff;">Unsubscribe from coldd marketing emails?</p>
<p style="margin:0 0 22px;font-size:13px;color:#7a7a7a;">You'll still get account and order emails. You can re-subscribe any time from your dashboard.</p>
<form method="POST" action="${action}">
<button type="submit" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#cc0011,#ff3344);color:#fff;font-weight:700;font-size:14px;border:none;border-radius:6px;cursor:pointer;font-family:inherit;">Unsubscribe</button>
</form>`);
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    // POST - perform the unsubscribe (human confirm button, or a mailbox
    // provider's RFC 8058 one-click POST).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data, error } = await admin
      .from("profiles")
      .update({ marketing_unsubscribed: true })
      .eq("email_unsub_token", token)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[email-unsubscribe] error:", error.message);
      return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Something went wrong. Try again later.</p>`, 500);
    }
    if (!data) {
      return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">That link is invalid.</p>`, 404);
    }

    return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">You're unsubscribed.</p>
<p style="margin:10px 0 0;font-size:13px;color:#7a7a7a;">You won't get marketing emails from coldd anymore. Account and order emails are unaffected.</p>`);
  } catch (err) {
    console.error("[email-unsubscribe] error:", err);
    return page(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Something went wrong. Try again later.</p>`, 500);
  }
});
