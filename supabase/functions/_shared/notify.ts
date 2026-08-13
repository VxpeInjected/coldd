// supabase/functions/_shared/notify.ts
//
// Inserts a row into public.notifications so it shows up in the nav bell.
// Best-effort only - a notification failing to insert should never fail
// the action that triggered it (an order refund/review reply already
// succeeded by the time this runs), so callers should not await this in
// a way that blocks their response on it failing.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function notifyUser(
  admin: SupabaseClient,
  userId: string,
  title: string,
  body?: string | null,
  url?: string | null,
) {
  try {
    await admin.from("notifications").insert({ user_id: userId, title, body: body ?? null, url: url ?? null });
  } catch (err) {
    console.error("[notify] failed to insert notification:", err);
  }
}
