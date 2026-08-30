// supabase/functions/_shared/order_access.ts
//
// Shared "is the caller allowed to act on this order?" check for the three
// success-page functions: get-order-by-session, get-download-url,
// submit-reseller-info.
//
// Two trust models, picked by whether the order is tied to an account:
//
//   - Account order (orders.user_id set - every Robux order, plus any
//     signed-in card/PayPal/crypto one): the id in the success URL is only
//     a lookup key. The caller MUST present a JWT for that exact user.
//     Forwarding the link gets the recipient nothing.
//
//   - Guest order (orders.user_id null): the buyer has no auth.uid(), so
//     possession of a secret is the only possible proof. That secret is a
//     one-time `claim_token` minted when the order is created and handed
//     back only in the payment provider's success redirect (`?t=...`) - NOT
//     the Stripe session id, which also appears in the Stripe dashboard,
//     webhook logs and browser history. The token is stored only as a
//     SHA-256 hash, and it only counts for GUEST_WINDOW_MS after payment.
//     Past that the guest claims a free account with their checkout email.
//
// createClient / getUser live in the callers (they already import
// supabase-js); this module is pure logic + the hash helper.

export const GUEST_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A URL-safe token to embed in a guest order's success redirect. */
export function genClaimToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type OrderRow = {
  user_id: string | null;
  // Gift orders: user_id is the recipient, purchased_by_user_id is the
  // buyer. Both should be able to open the success page.
  purchased_by_user_id?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  claim_token_hash?: string | null;
};

type Verdict =
  | { ok: true; via: "account" | "guest-token" }
  | { ok: false; status: number; code?: string; error: string };

/**
 * @param getUserId  async () => the authenticated caller's user id, or null.
 *                    (The caller builds this from its own supabase-js client so
 *                    this module stays dependency-free.)
 * @param token      the raw `t` value from the success URL, if any.
 * @param opts.requirePaid  reject unless status === "paid" (downloads /
 *                    reseller submit want this; the status poll does not).
 */
export async function verifyOrderAccess(
  order: OrderRow | null,
  getUserId: () => Promise<string | null>,
  token: string,
  opts: { requirePaid?: boolean; windowMs?: number } = {},
): Promise<Verdict> {
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (opts.requirePaid && order.status !== "paid") {
    return { ok: false, status: 404, error: "Order not found." };
  }

  if (order.user_id) {
    const uid = await getUserId();
    if (!uid) {
      return { ok: false, status: 401, code: "SIGN_IN_REQUIRED", error: "Please sign in as the account that placed this order." };
    }
    if (uid !== order.user_id && uid !== (order.purchased_by_user_id || null)) {
      return { ok: false, status: 403, error: "This order belongs to a different account." };
    }
    return { ok: true, via: "account" };
  }

  // Guest order.
  const expected = order.claim_token_hash || "";
  const provided = String(token || "");
  if (!expected || !provided || (await sha256Hex(provided)) !== expected) {
    return { ok: false, status: 403, code: "LINK_INVALID", error: "This link is missing its access token. Open the link from your confirmation page or email, or create a free account with your checkout email." };
  }
  const anchor = Date.parse(order.paid_at || order.created_at || "");
  const windowMs = opts.windowMs ?? GUEST_WINDOW_MS;
  if (Number.isFinite(anchor) && Date.now() - anchor > windowMs) {
    return { ok: false, status: 403, code: "LINK_EXPIRED", error: "This guest download link has expired. Create a free account with the email you used at checkout to download your purchases any time." };
  }
  return { ok: true, via: "guest-token" };
}
