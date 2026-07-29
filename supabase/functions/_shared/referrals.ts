// Shared by the referral Edge Functions.
export const REFERRAL_RATE = 0.20;

export function makeReferralCode(seed: string): string {
  const base = (seed || "user").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "user";
  const suffix = Math.random().toString(36).slice(2, 6);
  return base + suffix;
}
