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
// GET ?t=<token> - sets marketing_unsubscribed and returns a small branded
// confirmation page directly (no separate static page needed for a
// one-shot, rarely-visited link like this).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function html(body: string, status = 200) {
  const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unsubscribe - coldd</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#d7d7d7;">
<div style="max-width:420px;margin:80px auto;padding:36px 32px;background:#0b0b0b;border:1px solid #1a1a1a;border-radius:8px;text-align:center;">
<p style="margin:0 0 6px;font-size:9px;letter-spacing:4px;color:#ff3344;text-transform:uppercase;font-weight:700;">coldd Development</p>
${body}
</div>
</body></html>`;
  return new Response(page, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  try {
    const token = new URL(req.url).searchParams.get("t");
    if (!token) return html(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Missing unsubscribe link.</p>`, 400);

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
      return html(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Something went wrong. Try again later.</p>`, 500);
    }
    if (!data) {
      return html(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">That link is invalid or already used.</p>`, 404);
    }

    return html(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">You're unsubscribed.</p>
<p style="margin:10px 0 0;font-size:13px;color:#7a7a7a;">You won't get marketing emails from coldd anymore. Account and order emails are unaffected.</p>`);
  } catch (err) {
    console.error("[email-unsubscribe] error:", err);
    return html(`<p style="margin:14px 0 0;font-size:16px;color:#ffffff;">Something went wrong. Try again later.</p>`, 500);
  }
});
