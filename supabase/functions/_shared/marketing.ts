// supabase/functions/_shared/marketing.ts
//
// Records a checkout marketing opt-in (the "Email me deals, drops, and
// product updates" box, which now carries a 10% discount). Called once
// per order-completion path, same "best-effort, must never fail the real
// action underneath it" rule every other fire-and-forget helper in this
// codebase follows (notifyUser, resolveGiftReceipt).
//
// Tracked by email so a guest checkout still gets recorded - checkout
// never requires an account. A signed-in buyer ALSO gets
// profiles.notification_prefs.promotions synced to true, so this shows up
// in the Notifications settings tab they can already see and revoke from,
// instead of being a second, invisible opt-in nobody can find.

// deno-lint-ignore no-explicit-any
export async function recordMarketingOptIn(admin: any, email: string | null | undefined, userId?: string | null) {
  let cleanEmail = (email || "").trim().toLowerCase();
  // Crypto/Robux checkout captures no guest email at all (same limitation
  // sendOrderReceipt already accepts for those two) - for a signed-in
  // buyer there's still a real address on their account worth falling
  // back to, so the opt-in isn't silently lost just because this
  // particular payment method never collects one directly.
  if (!cleanEmail && userId) {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      cleanEmail = (data?.user?.email || "").trim().toLowerCase();
    } catch (_err) { /* fall through to the no-email no-op below */ }
  }
  if (!cleanEmail) return;
  try {
    await admin.from("marketing_optins").upsert({
      email: cleanEmail,
      user_id: userId || null,
      source: "checkout",
      subscribed_at: new Date().toISOString(),
      // Ticking the box again after a prior unsubscribe re-opts them in.
      unsubscribed_at: null,
    });
    if (userId) {
      const { data: profile } = await admin.from("profiles").select("notification_prefs").eq("id", userId).maybeSingle();
      const prefs = Object.assign({}, profile?.notification_prefs || {}, { promotions: true });
      await admin.from("profiles").update({ notification_prefs: prefs }).eq("id", userId);
    }
  } catch (err) {
    console.error("[marketing] failed to record opt-in:", err);
  }
}
