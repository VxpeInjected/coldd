// Live USD -> other-currency conversion, shared by any payment path that has
// to quote a price in a currency other than the USD everything is priced in
// internally (RelayPay's AUD settlement, Stripe's region-locked local
// payment methods like Bancontact/BLIK/Pix that can't take USD at all).
//
// Frankfurter is ECB-sourced, free, and needs no API key - fine for a
// same-day rate, not for anything that needs tick-level accuracy.

export async function usdTo(amountUsd: number, currency: string): Promise<number> {
  const to = currency.toUpperCase();
  if (to === "USD") return Math.round(amountUsd * 100) / 100;

  const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`Could not fetch a USD/${to} exchange rate.`);
  const data = await res.json();
  const rate = Number(data?.rates?.[to] ?? NaN);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Got an invalid USD/${to} exchange rate.`);
  return Math.round(amountUsd * rate * 100) / 100;
}
