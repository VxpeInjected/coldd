// supabase/functions/admin-send-campaign/index.ts
//
// Deploy with:
//   supabase functions deploy admin-send-campaign
//
// Three actions:
//
//   { action: "status" }
//   Returns whether RESEND_API_KEY is set, for the admin panel's
//   "email sending isn't configured yet" banner.
//
//   { action: "test", subject, bodyHtml, testEmail }
//   Sends one email to testEmail only. Never touches email_campaigns.
//
//   { action: "send", subject, bodyHtml }
//   Sends to every profile with marketing_unsubscribed = false, an email
//   set, and not banned. Writes one email_campaigns row up front (status
//   'sending'), sends in batches of 100 via Resend's batch endpoint, then
//   updates the row with final counts/status.
//
// Runs synchronously inside the request - fine for the audience sizes this
// site has today (dozens to low hundreds of accounts). A list in the tens
// of thousands would need a queue instead of one request doing every batch
// inline; not built here because there's no audience anywhere near that
// size yet, and building a queue for load that doesn't exist is exactly
// the kind of premature machinery this codebase avoids elsewhere.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailConfigured, sendBatch, sendSingle, unsubscribeHeaders, wrapCampaignEmail, type BatchEmail } from "../_shared/email.ts";

const ALLOWED_ORIGIN = "https://coldd.dev";
const BATCH_SIZE = 100;

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
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_admin, email_unsub_token")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const unsubUrl = (token: string) => `${supabaseUrl}/functions/v1/email-unsubscribe?t=${token}`;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "status") return json({ ok: true, configured: emailConfigured() });

    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.bodyHtml || "").trim();
    if (!subject || !bodyHtml) return json({ ok: false, error: "Subject and body are required." }, 400);

    if (action === "test") {
      const testEmail = String(body.testEmail || "").trim();
      if (!testEmail) return json({ ok: false, error: "Enter an email to send the test to." }, 400);
      const testUnsubUrl = unsubUrl(profile.email_unsub_token);
      const html = wrapCampaignEmail(bodyHtml, testUnsubUrl);
      const result = await sendSingle(testEmail, `[Test] ${subject}`, html, unsubscribeHeaders(testUnsubUrl));
      if (!result.ok) return json({ ok: false, error: result.error, code: result.code }, result.code === "NOT_CONFIGURED" ? 400 : 502);
      return json({ ok: true });
    }

    if (action !== "send") return json({ ok: false, error: "Unknown action." }, 400);

    if (!emailConfigured()) {
      return json({ ok: false, error: "Email sending is not configured yet - RESEND_API_KEY is not set.", code: "NOT_CONFIGURED" }, 400);
    }

    const { data: recipients, error: recErr } = await admin
      .from("profiles")
      .select("email, email_unsub_token")
      .eq("marketing_unsubscribed", false)
      .not("email", "is", null)
      .or("banned.is.null,banned.eq.false");
    if (recErr) return json({ ok: false, error: "Could not load recipients." }, 500);

    const audience = (recipients || []).filter((r) => !!r.email);

    const { data: campaign, error: campaignErr } = await admin
      .from("email_campaigns")
      .insert({
        subject,
        body_html: bodyHtml,
        status: "sending",
        recipient_count: audience.length,
        created_by: userData.user.id,
      })
      .select()
      .single();
    if (campaignErr || !campaign) return json({ ok: false, error: "Could not create campaign." }, 500);

    let sentCount = 0;
    let failedCount = 0;
    let lastError: string | null = null;

    for (let i = 0; i < audience.length; i += BATCH_SIZE) {
      const chunk = audience.slice(i, i + BATCH_SIZE);
      const emails: BatchEmail[] = chunk.map((r) => {
        const u = unsubUrl(r.email_unsub_token);
        return {
          to: r.email as string,
          subject,
          html: wrapCampaignEmail(bodyHtml, u),
          headers: unsubscribeHeaders(u),
        };
      });
      const result = await sendBatch(emails);
      if (result.ok) {
        sentCount += result.sent;
      } else {
        failedCount += chunk.length;
        lastError = result.error;
        console.error("[admin-send-campaign] batch failed:", result.error);
      }
    }

    const finalStatus = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "sent";
    await admin
      .from("email_campaigns")
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        error: lastError,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return json({ ok: true, sentCount, failedCount, recipientCount: audience.length });
  } catch (err) {
    console.error("[admin-send-campaign] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
