// Shared PayPal Orders API v2 helpers.
//
// Environment is driven by the PAYPAL_ENV secret, NOT by a code constant:
//
//   supabase secrets set PAYPAL_ENV=live   (or sandbox, the default)
//
// Sandbox and Live are entirely separate systems with separate credentials, so
// going live is setting two secrets plus this one - never an edit here. The
// default is deliberately "sandbox": if the variable is missing or misspelled,
// the failure mode is "no real money moves", not "real money moves against a
// half-configured integration".

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

export function paypalEnv(): "sandbox" | "live" {
  return (Deno.env.get("PAYPAL_ENV") ?? "").trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalBase(): string {
  return paypalEnv() === "live" ? LIVE_BASE : SANDBOX_BASE;
}

/**
 * Client-credentials access token. Tokens last ~9 hours, but Edge Functions are
 * short-lived and may cold-start per request, so this deliberately does not try
 * to cache across invocations - a stale cached token would fail a real payment
 * to save one cheap round trip.
 */
export async function paypalToken(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID");
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!id || !secret) throw new Error("PayPal credentials are not configured.");

  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    // Never echo the response body - on a credentials failure PayPal can quote
    // parts of the request back, and this string ends up in function logs.
    throw new Error(`PayPal auth failed (${res.status}).`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new Error("PayPal auth returned no token.");
  return data.access_token as string;
}

export async function paypalFetch(
  path: string,
  init: RequestInit & { token: string },
): Promise<{ ok: boolean; status: number; data: any }> {
  const { token, ...rest } = init;
  const res = await fetch(`${paypalBase()}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/** PayPal wants amounts as a fixed 2dp string; a JS number would send "19.9". */
export function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function approveLink(order: any): string | null {
  const links = Array.isArray(order?.links) ? order.links : [];
  // "payer-action" is the current rel; "approve" is the older one. Accept both
  // so a PayPal-side rename does not silently break checkout.
  const l = links.find((x: any) => x?.rel === "payer-action" || x?.rel === "approve");
  return l?.href ?? null;
}
