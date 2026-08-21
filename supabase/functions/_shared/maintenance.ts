// supabase/functions/_shared/maintenance.ts
//
// site-gate.js's maintenance overlay is purely a client-side visual gate -
// it hides the page, it doesn't stop anything. Removing the overlay div in
// DevTools (or just hitting an Edge Function directly, no browser involved
// at all) always went straight through to a fully working checkout,
// maintenance mode or not. This is the actual enforcement point: call it
// from any order-creation function, right after auth resolves the caller,
// and refuse to start a new order while the site is down - unless the
// caller is staff, matching site-gate.js's own admin-bypass behavior.

// deno-lint-ignore no-explicit-any
export async function isSiteInMaintenance(admin: any): Promise<boolean> {
  const { data } = await admin.from("site_status").select("mode").eq("id", true).maybeSingle();
  return data?.mode === "maintenance";
}
