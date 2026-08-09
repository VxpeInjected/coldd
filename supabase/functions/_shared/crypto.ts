// Crypto payment provider adapter.
//
// Everything above this file talks to CryptoProvider, never to a vendor
// directly. That boundary exists for a specific reason: Coinbase Commerce was
// the original choice and turned out to be unavailable to Australian
// merchants, and the same could happen again. Swapping provider should be one
// implementation here plus new secrets - not a rewrite of the order flow.
//
// The interface is deliberately the narrowest thing that supports a hosted
// redirect checkout:
//   createCharge  - mint a payment page for an order we have already priced
//   verifyWebhook - prove an inbound status callback really came from them
//
// NOWPayments is the first implementation. It is non-custodial (funds settle
// to your own wallet), has no infrastructure to run, and unlike a self-hosted
// gateway costs nothing when idle - which matters at zero volume.

export type ChargeResult =
  | { ok: true; url: string; providerId: string }
  | { ok: false; error: string };

export interface CryptoProvider {
  readonly name: string;
  createCharge(input: {
    orderId: string;
    amountUsd: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    callbackUrl: string;
  }): Promise<ChargeResult>;
  /**
   * Returns the coldd order id when the payload is authentic AND represents a
   * settled payment. Anything else returns null - the caller must never
   * fulfil on an unverified or non-final callback.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<
    { orderId: string; providerId: string; amountUsd: number } | null
  >;
}

const NOWPAY_BASE = "https://api.nowpayments.io/v1";

/** Statuses NOWPayments uses for "the money is actually there". */
const SETTLED = new Set(["finished", "confirmed"]);

function nowpaymentsKey(): string {
  const k = (Deno.env.get("NOWPAYMENTS_API_KEY") ?? "").trim();
  if (!k) throw new Error("Crypto payments are not configured.");
  return k;
}

/** HMAC-SHA512 over the JSON body, keys sorted - NOWPayments' IPN scheme. */
async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Recursively key-sorted stringify. The IPN signature is computed over this
 *  exact form, so re-serialising the parsed body any other way will not match. */
function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(sortedStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
}

/** Constant-time compare, so a bad signature cannot be brute-forced by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const nowPayments: CryptoProvider = {
  name: "nowpayments",

  async createCharge(input) {
    const res = await fetch(`${NOWPAY_BASE}/invoice`, {
      method: "POST",
      headers: { "x-api-key": nowpaymentsKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: Math.round(input.amountUsd * 100) / 100,
        price_currency: "usd",
        // Our order id round-trips through the provider so the webhook can be
        // correlated without trusting anything the browser sends back.
        order_id: input.orderId,
        order_description: input.description,
        ipn_callback_url: input.callbackUrl,
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      }),
    });

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }

    if (!res.ok || !data?.invoice_url) {
      // Never echo the provider body - it can quote request fields back and
      // this lands in function logs.
      return { ok: false, error: `Crypto provider rejected the charge (${res.status}).` };
    }
    return { ok: true, url: String(data.invoice_url), providerId: String(data.id ?? "") };
  },

  async verifyWebhook(rawBody, headers) {
    const secret = (Deno.env.get("NOWPAYMENTS_IPN_SECRET") ?? "").trim();
    if (!secret) return null;

    const sent = headers.get("x-nowpayments-sig") ?? "";
    if (!sent) return null;

    let parsed: any;
    try { parsed = JSON.parse(rawBody); } catch { return null; }

    const expected = await hmacSha512Hex(secret, sortedStringify(parsed));
    if (!timingSafeEqual(sent.toLowerCase(), expected.toLowerCase())) return null;

    // Authentic, but only settled states may fulfil. "waiting", "confirming",
    // "sending", "partially_paid", "failed" and "expired" all mean the funds
    // are not (or never will be) fully there.
    const status = String(parsed.payment_status ?? "").toLowerCase();
    if (!SETTLED.has(status)) return null;

    // Second underpayment guard, independent of status. `partially_paid`
    // normally catches a short send, but the crypto-side figures are the
    // authoritative record of what actually arrived, so check them directly
    // when present. A dust-level shortfall is tolerated because exchanges and
    // network fees routinely shave the last decimal places off a transfer.
    const due = Number(parsed.pay_amount ?? NaN);
    const got = Number(parsed.actually_paid ?? NaN);
    if (Number.isFinite(due) && Number.isFinite(got) && due > 0) {
      if (got < due * 0.995) return null;
    }

    const orderId = String(parsed.order_id ?? "");
    if (!orderId) return null;

    return {
      orderId,
      providerId: String(parsed.payment_id ?? parsed.invoice_id ?? ""),
      // price_amount is the USD figure WE set on the invoice. The caller still
      // re-checks it against the order total, so a tampered-but-signed payload
      // cannot under-pay.
      amountUsd: Number(parsed.price_amount ?? NaN),
    };
  },
};

export function activeProvider(): CryptoProvider {
  // One switch point. A second provider is a new object above plus a case here.
  const name = (Deno.env.get("CRYPTO_PROVIDER") ?? "nowpayments").trim().toLowerCase();
  switch (name) {
    case "nowpayments":
    default:
      return nowPayments;
  }
}
