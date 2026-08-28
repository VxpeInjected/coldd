// supabase/functions/_shared/google_oauth.ts
//
// Shared by youtube-oauth-exchange and admin-youtube-analytics: the
// YouTube Analytics API is OAuth-only (no API-key path), so the coldd
// Google account authorises once and this rotates the short-lived access
// token off the stored refresh token, writing the new one back as a
// project secret via the Supabase Management API (same mechanism as the
// TikTok flow). Needs MANAGEMENT_API_TOKEN set.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function persistSecrets(pairs: Record<string, string>): Promise<boolean> {
  const mgmt = Deno.env.get("MANAGEMENT_API_TOKEN");
  if (!mgmt) { console.error("[google_oauth] MANAGEMENT_API_TOKEN not set"); return false; }
  const ref = new URL(Deno.env.get("SUPABASE_URL")!).hostname.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
    body: JSON.stringify(Object.entries(pairs).map(([name, value]) => ({ name, value }))),
  });
  if (!res.ok) console.error("[google_oauth] secret write failed:", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const clientId = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { ok: false as const, error: "YOUTUBE_OAUTH_CLIENT_ID / _SECRET not set." };
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false as const, error: data.error_description || data.error || `Google returned ${res.status}` };
  }
  return { ok: true as const, accessToken: data.access_token as string, refreshToken: (data.refresh_token || "") as string };
}

// Trades the stored refresh token for a fresh access token and persists
// it. Returns the new access token or null (a full reconnect is the only
// fix then - Google refresh tokens don't expire unless revoked or unused
// for 6 months, so this should be rare).
export async function refreshAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("YOUTUBE_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error("[google_oauth] refresh failed:", res.status, JSON.stringify(data));
    return null;
  }
  await persistSecrets({ YOUTUBE_OAUTH_ACCESS_TOKEN: data.access_token });
  return data.access_token as string;
}
