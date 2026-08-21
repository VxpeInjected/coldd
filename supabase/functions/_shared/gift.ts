// supabase/functions/_shared/gift.ts
//
// Every payment-completion path (stripe-webhook, capture-paypal-order,
// crypto-webhook, verify-robux-order) calls sendOrderReceipt(admin, orderId,
// guestEmail?) once an order is confirmed paid. For a gift order
// (purchased_by_user_id set), orders.user_id is the RECIPIENT, not the
// buyer - so sendOrderReceipt's default "look up user_id's email" behaviour
// would otherwise send the payment receipt to whoever received the gift
// instead of whoever paid for it.
//
// Called once per paid order, right after it's loaded, before
// sendOrderReceipt. Returns the guestEmail override to pass into
// sendOrderReceipt (null for a non-gift order, so every call site's
// existing guest-email logic - Stripe's collected email, PayPal's payer
// email, etc. - is completely unaffected). Also fires the in-site bell
// notification here for whoever actually has an account on this order -
// the recipient on a gift, or the buyer on an ordinary self-purchase -
// since a receipt email is not the same as something showing up in the
// nav bell, and until this existed neither a real purchase nor a granted
// product ever produced one ("bought 5 things, got no notifications").

import { notifyUser } from "./notify.ts";

// deno-lint-ignore no-explicit-any
export async function resolveGiftReceipt(
  // deno-lint-ignore no-explicit-any
  admin: any,
  order: { id: string; user_id: string | null; purchased_by_user_id?: string | null },
): Promise<string | null> {
  // Best-effort, same as every other notifyUser call site - a notification
  // failing to insert must never block or fail the receipt email above it.
  // deno-lint-ignore no-explicit-any
  const { data: items } = await admin.from("order_items").select("title").eq("order_id", order.id) as { data: any[] | null };
  const titles = (items || []).map((i) => i.title).join(", ") || "your order";

  if (!order.purchased_by_user_id) {
    if (order.user_id) {
      await notifyUser(admin, order.user_id, "Purchase confirmed", `${titles} is now in your Licenses.`, "/dashboard?panel=owned");
    }
    return null;
  }

  const { data: buyerRes } = await admin.auth.admin.getUserById(order.purchased_by_user_id);
  const buyerEmail: string | null = buyerRes?.user?.email || null;

  if (order.user_id) {
    await notifyUser(
      admin,
      order.user_id,
      "You received a gift!",
      `Someone sent you ${titles} on coldd.`,
      "/dashboard?panel=owned",
    );
  }
  await notifyUser(admin, order.purchased_by_user_id, "Gift sent", `Your gift order for ${titles} is confirmed.`, "/dashboard?panel=purchases");

  return buyerEmail;
}
