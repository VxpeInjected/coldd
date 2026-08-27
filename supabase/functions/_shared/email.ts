// supabase/functions/_shared/email.ts
//
// Thin Resend client + branded HTML templates, shared between
// admin-send-campaign and cron-abandoned-cart-emails.
//
// Gated behind RESEND_API_KEY. Until that secret is set, sendCampaignBatch
// and sendSingle return { ok: false, code: "NOT_CONFIGURED" } for every
// call rather than throwing - callers (the admin UI, the cron job) show
// that as a clear "email sending isn't set up yet" state instead of a
// crash, same pattern as ROBLOX_FALLBACK_COOKIE/ADBLOX_API_KEY elsewhere in
// this codebase.

const RESEND_API_BASE = "https://api.resend.com";
const FROM_ADDRESS = "coldd <noreply@coldd.dev>";

function apiKey(): string | undefined {
  return Deno.env.get("RESEND_API_KEY") || undefined;
}

export function emailConfigured(): boolean {
  return !!apiKey();
}

export type SendResult = { ok: true } | { ok: false; error: string; code?: string };

/** Sends one email immediately - used for the campaign "send test" button. */
export async function sendSingle(to: string, subject: string, html: string): Promise<SendResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: "Email sending is not configured yet.", code: "NOT_CONFIGURED" };

  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend returned HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

export type BatchEmail = { to: string; subject: string; html: string };

/**
 * Sends up to 100 emails in one Resend batch call. Larger lists must be
 * chunked by the caller - this function does not paginate on its own,
 * since callers need per-chunk error handling (a chunk failing shouldn't
 * silently drop the rest of the list).
 */
export async function sendBatch(emails: BatchEmail[]): Promise<{ ok: true; sent: number } | { ok: false; error: string; code?: string }> {
  if (!emails.length) return { ok: true, sent: 0 };
  const key = apiKey();
  if (!key) return { ok: false, error: "Email sending is not configured yet.", code: "NOT_CONFIGURED" };
  if (emails.length > 100) return { ok: false, error: "Batch of more than 100 - caller must chunk." };

  const res = await fetch(`${RESEND_API_BASE}/emails/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.map((e) => ({ from: FROM_ADDRESS, to: e.to, subject: e.subject, html: e.html }))),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend returned HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, sent: emails.length };
}

/**
 * Wraps campaign body HTML in the same dark/red-accent shell as every other
 * coldd transactional email (see email-otp's emailHtml()), so a marketing
 * send doesn't look like a different product. bodyHtml is trusted, admin-
 * authored content, not user input - no escaping here.
 */
export function wrapCampaignEmail(bodyHtml: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#030303;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#030303;padding:44px 0 56px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;background-color:#0b0b0b;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(90deg,#ff2233 0%,#ff6677 50%,#ff2233 100%);height:3px;line-height:3px;font-size:3px;">&nbsp;</td></tr>

<tr><td style="padding:40px 44px 8px;">
<p style="margin:0;font-size:9px;letter-spacing:4px;color:#ff3344;text-transform:uppercase;font-weight:700;font-family:Arial,Helvetica,sans-serif;">coldd Development</p>
</td></tr>

<tr><td style="padding:18px 44px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#d7d7d7;">
${bodyHtml}
</td></tr>

<tr><td style="padding:0 44px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid rgba(255,51,68,0.2);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<tr><td style="padding:24px 44px 40px;">
<p style="margin:0;font-size:11px;color:#3e3e3e;line-height:1.8;font-family:Arial,Helvetica,sans-serif;">
You're receiving this because you have a coldd account. <a href="${unsubscribeUrl}" style="color:#ff3344;text-decoration:none;">Unsubscribe</a> at any time.<br>
Need help? Contact <a href="mailto:support@coldd.dev" style="color:#ff3344;text-decoration:none;">support@coldd.dev</a>.
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

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Same rules as admin.js's simpleMarkdownToHtml (blank line = paragraph,
// **bold**) - kept in sync deliberately so an admin previews and gets
// exactly what a lifecycle automation (rendered here, server-side, at send
// time) will actually look like.
export function renderBodyMd(text: string): string {
  const paras = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => {
      const line = escapeHtml(p.trim()).replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return line ? `<p style="margin:0 0 16px;">${line}</p>` : "";
    })
    .join("");
}

export function ctaButtonHtml(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(135deg,#cc0011 0%,#ff3344 100%);border-radius:6px;">
<a href="${url}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export type LineItem = { title: string; qty?: number; linkUrl?: string; linkLabel?: string };

export function itemsTableHtml(items: LineItem[]): string {
  const rows = items
    .map((i) => {
      const qty = i.qty && i.qty > 1 ? ` &times; ${i.qty}` : "";
      const link = i.linkUrl ? ` &nbsp;<a href="${i.linkUrl}" style="color:#ff3344;text-decoration:none;font-size:12px;">${escapeHtml(i.linkLabel || "View")}</a>` : "";
      return `<tr><td style="padding:8px 0;border-top:1px solid #1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#d7d7d7;">${escapeHtml(i.title)}${qty}${link}</td></tr>`;
    })
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#111111;border-radius:6px;border:1px solid #1a1a1a;padding:6px 18px;margin-bottom:24px;">${rows}</table>`;
}

/**
 * Builds a lifecycle automation email from an admin-authored config row
 * (subject + body_md) plus optional extra HTML (an item list, a CTA
 * button) appended after the body text. Used by cron-lifecycle-emails for
 * all three automation types - the only thing that differs between an
 * abandoned-cart nudge, a review request, and a re-engagement email is
 * which config row and which extra blocks get passed in.
 */
export function renderAutomationEmail(bodyMd: string, extraHtmlBlocks: string[], unsubscribeUrl: string): string {
  const html = renderBodyMd(bodyMd) + extraHtmlBlocks.join("\n");
  return wrapCampaignEmail(html, unsubscribeUrl);
}

/**
 * Same visual shell as wrapCampaignEmail (marketing), minus the unsubscribe
 * link/footer - a receipt is a transactional record of a purchase, not a
 * marketing send, and must go out regardless of profiles.marketing_unsubscribed.
 * Separate function rather than an optional param so a future edit to the
 * marketing footer can't accidentally leak into transactional mail or vice
 * versa.
 */
export function wrapTransactionalEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#030303;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#030303;padding:44px 0 56px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;background-color:#0b0b0b;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(90deg,#ff2233 0%,#ff6677 50%,#ff2233 100%);height:3px;line-height:3px;font-size:3px;">&nbsp;</td></tr>

<tr><td style="padding:40px 44px 8px;">
<p style="margin:0;font-size:9px;letter-spacing:4px;color:#ff3344;text-transform:uppercase;font-weight:700;font-family:Arial,Helvetica,sans-serif;">coldd Development</p>
</td></tr>

<tr><td style="padding:18px 44px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#d7d7d7;">
${bodyHtml}
</td></tr>

<tr><td style="padding:0 44px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid rgba(255,51,68,0.2);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<tr><td style="padding:24px 44px 40px;">
<p style="margin:0;font-size:11px;color:#3e3e3e;line-height:1.8;font-family:Arial,Helvetica,sans-serif;">
Need help? Contact <a href="mailto:support@coldd.dev" style="color:#ff3344;text-decoration:none;">support@coldd.dev</a>.
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

/**
 * Fetches an order + its items and emails a receipt via the transactional
 * shell. Called from every payment path (Stripe/PayPal/crypto/Robux) right
 * after the same idempotency-guarded UPDATE that flips an order to 'paid',
 * so it only ever fires once per order regardless of webhook retries.
 *
 * Email resolution: a signed-in buyer's address comes from auth.users
 * (always present, never missing). A guest buyer only has an address if the
 * caller passes one in explicitly (guestEmail) - Stripe Checkout always
 * collects one on its own hosted page, so the Stripe webhook can pass
 * session.customer_details.email. PayPal/crypto/Robux currently capture no
 * guest email anywhere in the checkout flow, so a guest paying by one of
 * those methods will not receive a receipt until that gap is closed
 * separately - this function silently no-ops rather than erroring when no
 * address is available, since a missing receipt must never fail or retry
 * the payment webhook that triggered it.
 */
export async function sendOrderReceipt(
  admin: any,
  orderId: string,
  guestEmail?: string | null,
): Promise<SendResult> {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, user_id, total_usd, currency, created_at")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) return { ok: false, error: "Order not found for receipt." };

  let to = guestEmail || null;
  if (!to && order.user_id) {
    const { data: userRes } = await admin.auth.admin.getUserById(order.user_id);
    to = userRes?.user?.email || null;
  }
  if (!to) return { ok: false, error: "No email address available for this order.", code: "NO_EMAIL" };

  const { data: items } = await admin
    .from("order_items")
    .select("title, qty, product_slug")
    .eq("order_id", orderId);

  const itemsHtml = itemsTableHtml(
    (items || []).map((i: any) => ({
      title: i.title,
      qty: i.qty,
      linkUrl: `https://coldd.dev/product?id=${encodeURIComponent(i.product_slug)}`,
      linkLabel: "View",
    })),
  );

  const total = `$${Number(order.total_usd).toFixed(2)}`;
  const shortId = String(order.id).slice(0, 8).toUpperCase();

  const body = `
<p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Order confirmed</p>
<p style="margin:0 0 24px;">Thanks for your order - here's your receipt. Every item below is ready to download right away.</p>
${itemsHtml}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a7a7a;">Order #${shortId} &middot; Total charged</td>
<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;">${total}</td></tr>
</table>
${order.user_id ? ctaButtonHtml("https://coldd.dev/dashboard?panel=owned", "Go to your downloads") : ""}
${order.user_id ? "" : `<p style="margin:20px 0 0;font-size:12px;color:#7a7a7a;">Bought as a guest - create an account with this email any time to see this order and re-download later.</p>`}
`;

  const html = wrapTransactionalEmail(body);
  return sendSingle(to, `Your coldd order #${shortId} is confirmed`, html);
}
