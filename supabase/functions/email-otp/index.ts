// supabase/functions/email-otp/index.ts
//
// Deploy with:
//   supabase functions deploy email-otp
//
// Required secrets (set once):
//   supabase secrets set SMTP_HOST=smtp.migadu.com
//   supabase secrets set SMTP_PORT=465
//   supabase secrets set SMTP_USER=noreply@coldd.dev
//   supabase secrets set SMTP_PASSWORD=your-mailbox-password
//
// Use port 465 (implicit TLS), NOT 587 (STARTTLS) - 587 is known to hang
// from Supabase Edge Functions and cause a platform 503. See the SMTPClient
// setup below.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Edge Functions runtime - no need to set those yourself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I - avoids misreads
const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
// Matches the client-side resend cooldown (auth.js's RESEND_SECONDS) -
// without this, nothing stops a script from spamming send requests for an
// email that isn't even the caller's inbox to receive (rate limited on our
// side, not just disabled in the UI).
const RESEND_COOLDOWN_SECONDS = 30;

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

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function emailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify your email</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background-color:#030303;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#030303;background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2248%22%20height%3D%2248%22%3E%3Cline%20x1%3D%220%22%20y1%3D%2248%22%20x2%3D%2248%22%20y2%3D%220%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%220.7%22%20opacity%3D%220.035%22%2F%3E%3C%2Fsvg%3E');padding:44px 0 56px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;background-color:#0b0b0b;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(90deg,#ff2233 0%,#ff6677 50%,#ff2233 100%);height:3px;line-height:3px;font-size:3px;">&nbsp;</td></tr>

<tr><td style="padding:40px 44px 8px;">
<p style="margin:0;font-size:9px;letter-spacing:4px;color:#ff3344;text-transform:uppercase;font-weight:700;font-family:Arial,Helvetica,sans-serif;">coldd Development</p>
<p style="margin:14px 0 0;font-size:22px;color:#ffffff;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Verify your email</p>
<p style="margin:10px 0 0;font-size:13px;color:#585858;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Enter this code to confirm your account. It expires in ${EXPIRY_MINUTES} minutes.</p>
</td></tr>

<tr><td style="padding:26px 44px 30px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%221%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.055%22%2F%3E%3C%2Fsvg%3E');border-radius:6px;border:1px solid #1a1a1a;">
<tr><td align="center" style="padding:28px 22px;">
<table cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#cc0011 0%,#ff3344 100%);border-radius:5px;width:100%;">
<tr><td align="center" style="padding:18px 22px;">
<p align="center" style="margin:0;text-align:center;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;letter-spacing:6px;color:#ffffff;">${code}</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 44px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid rgba(255,51,68,0.2);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<tr><td style="padding:24px 44px 40px;">
<p style="margin:0;font-size:11px;color:#3e3e3e;line-height:1.8;font-family:Arial,Helvetica,sans-serif;">
Didn't request this? You can safely ignore this email.<br><br>
Need help? Contact <a href="mailto:support@coldd.dev" style="color:#ff3344;text-decoration:none;">support@coldd.dev</a>.<br>
coldd Development will never ask for your password. Any message claiming to be from us that isn't sent from an <strong style="color:#7a7a7a;">@coldd.dev</strong> address is not from us.
</p>
</td></tr>

<tr><td style="background-color:#070707;border-top:1px solid #141414;padding:18px 44px;">
<p style="margin:0;font-size:10px;color:#252525;font-family:Arial,Helvetica,sans-serif;">coldd Development &nbsp;&middot;&nbsp; noreply@coldd.dev</p>
</td></tr>

<tr><td style="background:linear-gradient(90deg,#ff2233 0%,#ff6677 50%,#ff2233 100%);height:2px;line-height:2px;font-size:2px;">&nbsp;</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify the caller from their own JWT (never trust a client-supplied email).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Not authenticated." }, 401);
    const user = userData.user;
    const email = user.email;
    if (!email) return json({ ok: false, error: "No email on account." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "send") {
      const { data: existing } = await admin.from("email_otps").select("expires_at").eq("email", email).maybeSingle();
      if (existing) {
        const lastSentAt = new Date(existing.expires_at).getTime() - EXPIRY_MINUTES * 60_000;
        const elapsedSeconds = (Date.now() - lastSentAt) / 1000;
        if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
          return json({ ok: false, error: "Please wait a moment before requesting another code." }, 429);
        }
      }

      const code = generateCode();
      const code_hash = await hashCode(code);
      const expires_at = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();

      const { error: upsertErr } = await admin.from("email_otps").upsert({
        email, code_hash, expires_at, attempts: 0,
      });
      if (upsertErr) return json({ ok: false, error: "Could not create code." }, 500);

      // Port 465 with implicit TLS is the reliable option for outbound SMTP
      // from Supabase Edge Functions. Port 587/STARTTLS is known to hang in
      // this environment and can cause a platform-level 503 timeout.
      const client = new SMTPClient({
        connection: {
          hostname: Deno.env.get("SMTP_HOST")!,
          port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
          tls: true,
          auth: {
            username: Deno.env.get("SMTP_USER")!,
            password: Deno.env.get("SMTP_PASSWORD")!,
          },
        },
      });

      try {
        await client.send({
          from: `coldd Development <${Deno.env.get("SMTP_USER")}>`,
          to: email,
          subject: "Your coldd verification code",
          html: emailHtml(code),
        });
      } finally {
        await client.close();
      }

      return json({ ok: true });
    }

    if (action === "verify") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) return json({ ok: false, error: "Missing code." }, 400);

      const { data: row } = await admin.from("email_otps").select("*").eq("email", email).single();
      if (!row) return json({ ok: false, error: "No code found. Request a new one." });
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ ok: false, error: "Code expired. Request a new one." });
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        return json({ ok: false, error: "Too many attempts. Request a new code." });
      }

      const hash = await hashCode(code);
      if (hash !== row.code_hash) {
        await admin.from("email_otps").update({ attempts: row.attempts + 1 }).eq("email", email);
        return json({ ok: false, error: "Incorrect code." });
      }

      await admin.from("profiles").update({ email_verified: true }).eq("id", user.id);
      await admin.from("email_otps").delete().eq("email", email);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[email-otp] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
