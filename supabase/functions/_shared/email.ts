// supabase/functions/_shared/email.ts
//
// Thin Resend client + branded HTML templates. Shared by admin-send-campaign,
// cron-lifecycle-emails, marketing-signup, send-contact-message, and the
// order-receipt path in every payment webhook.
//
// Gated behind RESEND_API_KEY. Until that secret is set, sendBatch and
// sendSingle return { ok: false, code: "NOT_CONFIGURED" } for every call
// rather than throwing - callers show that as a clear "email sending isn't
// set up yet" state instead of a crash.
//
// DESIGN: one light, near-monochrome shell for every coldd email. A white
// card on a warm off-white ground, one rose accent used sparingly, system
// fonts, generous whitespace. Deliberately NOT the dark product UI - light
// transactional mail renders predictably across Gmail / Outlook / Apple
// Mail and their dark modes, and reads as correspondence rather than a
// banner ad, which is what inbox filters reward.
//
// DELIVERABILITY: every send gets a real text/plain alternative (auto-
// derived from the HTML), a Reply-To that reaches a monitored inbox, and -
// for bulk mail - RFC 8058 one-click List-Unsubscribe headers.

const RESEND_API_BASE = "https://api.resend.com";
const FROM_ADDRESS = "coldd <noreply@coldd.dev>";
const REPLY_TO = "support@coldd.dev";
const SITE = "https://coldd.dev";

function apiKey(): string | undefined {
  return Deno.env.get("RESEND_API_KEY") || undefined;
}

export function emailConfigured(): boolean {
  return !!apiKey();
}

export type SendResult = { ok: true } | { ok: false; error: string; code?: string };

/**
 * RFC 8058 one-click unsubscribe headers for a bulk/marketing send. Gmail
 * and Yahoo require List-Unsubscribe + List-Unsubscribe-Post on bulk mail;
 * without them a sender's reputation degrades and messages land in spam.
 * The mailbox provider POSTs `List-Unsubscribe=One-Click` to the URL, which
 * email-unsubscribe handles without a confirmation step.
 *
 * URL only - no `mailto:` form, so there's no unsubscribe inbox to run.
 *
 * Transactional mail (receipts, OTP, contact form) must NOT carry these.
 */
export function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// Crude but adequate HTML -> text so every send has a real text/plain part
// (a missing one is a measurable spam signal). Not a full parser: it keeps
// link URLs, turns block tags into newlines, strips the rest, and decodes
// the handful of entities the templates actually use.
export function htmlToText(html: string): string {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const t = txt.replace(/<[^>]+>/g, "").trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, " - ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&times;/g, "x")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Sends one email immediately. `headers` for bulk sends - see unsubscribeHeaders(). */
export async function sendSingle(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
): Promise<SendResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: "Email sending is not configured yet.", code: "NOT_CONFIGURED" };

  const payload: Record<string, unknown> = {
    from: FROM_ADDRESS,
    reply_to: REPLY_TO,
    to,
    subject,
    html,
    text: htmlToText(html),
  };
  if (headers && Object.keys(headers).length) payload.headers = headers;

  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Resend returned HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: true };
}

export type BatchEmail = { to: string; subject: string; html: string; headers?: Record<string, string> };

/**
 * Sends up to 100 emails in one Resend batch call. Larger lists must be
 * chunked by the caller - this function does not paginate on its own, since
 * callers need per-chunk error handling.
 */
export async function sendBatch(
  emails: BatchEmail[],
): Promise<{ ok: true; sent: number } | { ok: false; error: string; code?: string }> {
  if (!emails.length) return { ok: true, sent: 0 };
  const key = apiKey();
  if (!key) return { ok: false, error: "Email sending is not configured yet.", code: "NOT_CONFIGURED" };
  if (emails.length > 100) return { ok: false, error: "Batch of more than 100 - caller must chunk." };

  const res = await fetch(`${RESEND_API_BASE}/emails/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.map((e) => {
      const item: Record<string, unknown> = {
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: e.to,
        subject: e.subject,
        html: e.html,
        text: htmlToText(e.html),
      };
      if (e.headers && Object.keys(e.headers).length) item.headers = e.headers;
      return item;
    })),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Resend returned HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: true, sent: emails.length };
}

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

/* ============================================================
   SHARED SHELL
   ============================================================ */

// One wrapper, two footers. `kind` picks the footer: a marketing send
// carries the unsubscribe line, a transactional one carries a support line
// and never an unsubscribe (a receipt must go out regardless of consent).
type ShellOpts = { preheader?: string; unsubscribeUrl?: string };

function shell(kind: "marketing" | "transactional", bodyHtml: string, opts: ShellOpts = {}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : "";

  const footer = kind === "marketing"
    ? `You're getting this because you have a coldd account.${
      opts.unsubscribeUrl
        ? ` <a href="${opts.unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe</a>.`
        : ""
    }`
    : `Questions? Just reply to this email, or reach us at <a href="mailto:support@coldd.dev" style="color:#71717a;text-decoration:underline;">support@coldd.dev</a>.`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;">
<tr><td style="padding:36px 40px 0;">
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:800;letter-spacing:-0.02em;color:#18181b;">coldd</span>
</td></tr>
<tr><td style="padding:22px 40px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#3f3f46;">
${bodyHtml}
</td></tr>
<tr><td style="padding:0 40px;"><div style="border-top:1px solid #e4e4e7;"></div></td></tr>
<tr><td style="padding:20px 40px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:#a1a1aa;">
${footer}<br>
coldd Development · <a href="${SITE}" style="color:#a1a1aa;text-decoration:none;">coldd.dev</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/* ============================================================
   BUILDING BLOCKS
   ============================================================ */

export function ctaButtonHtml(url: string, label: string, variant: "primary" | "accent" = "primary"): string {
  const bg = variant === "accent" ? "#e11d48" : "#18181b";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 4px;"><tr><td style="border-radius:8px;background:${bg};">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

// A bordered code / token box (verification code, discount code).
export function codeBoxHtml(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td align="center" style="padding:20px;background:#fafafa;border:1px dashed #d4d4d8;border-radius:10px;font-family:'SF Mono',SFMono-Regular,ui-monospace,Menlo,Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:#18181b;">${escapeHtml(code)}</td>
</tr></table>`;
}

export function headingHtml(text: string): string {
  return `<p style="margin:0 0 14px;font-size:19px;line-height:1.3;font-weight:600;color:#18181b;">${escapeHtml(text)}</p>`;
}

// Same lightweight markdown as admin.js's simpleMarkdownToHtml (blank line =
// paragraph, **bold**), kept in sync so an admin previews what actually sends.
export function renderBodyMd(text: string): string {
  const paras = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => {
      const line = escapeHtml(p.trim())
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#18181b;">$1</strong>');
      return line ? `<p style="margin:0 0 16px;">${line}</p>` : "";
    })
    .join("");
}

export type LineItem = { title: string; qty?: number; linkUrl?: string; linkLabel?: string };

export function itemsTableHtml(items: LineItem[]): string {
  const rows = items
    .map((i) => {
      const qty = i.qty && i.qty > 1 ? `<span style="color:#a1a1aa;">  ×${i.qty}</span>` : "";
      const link = i.linkUrl
        ? `<br><a href="${i.linkUrl}" style="color:#e11d48;text-decoration:none;font-size:13px;">${escapeHtml(i.linkLabel || "View")}</a>`
        : "";
      return `<tr><td style="padding:12px 0;border-top:1px solid #f4f4f5;font-size:14px;color:#3f3f46;">${
        escapeHtml(i.title)
      }${qty}${link}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;border-top:1px solid #e4e4e7;">${rows}</table>`;
}

/* ============================================================
   WRAPPERS (public API - names/signatures unchanged)
   ============================================================ */

/**
 * Marketing/campaign wrapper. bodyHtml is trusted, admin-authored content -
 * no escaping here.
 */
export function wrapCampaignEmail(bodyHtml: string, unsubscribeUrl: string): string {
  return shell("marketing", bodyHtml, { unsubscribeUrl });
}

/** Transactional wrapper - no unsubscribe, always delivered. */
export function wrapTransactionalEmail(bodyHtml: string, preheader?: string): string {
  return shell("transactional", bodyHtml, { preheader });
}

/**
 * Builds a lifecycle automation email from an admin-authored config row
 * (subject + body_md) plus optional extra HTML blocks appended after the
 * body text. Used by cron-lifecycle-emails for every automation type.
 */
export function renderAutomationEmail(bodyMd: string, extraHtmlBlocks: string[], unsubscribeUrl: string): string {
  const html = renderBodyMd(bodyMd) + extraHtmlBlocks.join("\n");
  return shell("marketing", html, { unsubscribeUrl });
}

/* ============================================================
   ORDER RECEIPT
   ============================================================ */

/**
 * Fetches an order + its items and emails a receipt via the transactional
 * shell. Called from every payment path right after the idempotency-guarded
 * UPDATE that flips an order to 'paid'. Silently no-ops when no address is
 * available - a missing receipt must never fail or retry the webhook.
 */
// deno-lint-ignore no-explicit-any
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
    // deno-lint-ignore no-explicit-any
    (items || []).map((i: any) => ({
      title: i.title,
      qty: i.qty,
      linkUrl: `${SITE}/product?id=${encodeURIComponent(i.product_slug)}`,
      linkLabel: "View product",
    })),
  );

  const total = `$${Number(order.total_usd).toFixed(2)}`;
  const shortId = String(order.id).slice(0, 8).toUpperCase();

  const body = `
${headingHtml("Order confirmed")}
<p style="margin:0 0 22px;">Thanks for your order. Everything below is ready to download now.</p>
${itemsHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
<tr>
<td style="font-size:13px;color:#a1a1aa;">Order ${shortId}</td>
<td align="right" style="font-size:15px;font-weight:600;color:#18181b;">${total}</td>
</tr>
</table>
${order.user_id ? ctaButtonHtml(`${SITE}/dashboard?panel=owned`, "Go to your downloads") : ""}
${
    order.user_id
      ? ""
      : `<p style="margin:20px 0 0;font-size:13px;color:#a1a1aa;">Bought as a guest — create an account with this email any time to see this order and re-download later.</p>`
  }
`;

  return sendSingle(
    to,
    `Your coldd order ${shortId}`,
    wrapTransactionalEmail(body, `Order ${shortId} confirmed — ${total}`),
  );
}
