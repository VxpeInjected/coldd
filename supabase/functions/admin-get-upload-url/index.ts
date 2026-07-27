// supabase/functions/admin-get-upload-url/index.ts
//
// Deploy with:
//   supabase functions deploy admin-get-upload-url
//
// Same auth pattern as the other admin-* functions. Mints a short-lived
// signed Storage upload URL so the admin's browser can PUT a file straight
// to Storage (thumbnail/gallery image, or the real product download file)
// without routing the bytes through this function. The caller then saves
// the returned `path` back onto the product row (image/gallery via
// admin-upsert-product, or products.storage_path for the download file).
//
// Requires two buckets to exist (create via Dashboard -> Storage):
//   - "product-media": PUBLIC bucket, for thumbnails/gallery images.
//   - "product-files": PRIVATE bucket, already created in the Phase A
//     purchase-flow setup - reused here for admin-uploaded product files.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://vxpeinjected.github.io";
const MEDIA_BUCKET = "product-media";
const FILES_BUCKET = "product-files";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function safeName(name: string) {
  return String(name || "file").toLowerCase().replace(/[^a-z0-9.\-]+/g, "-").slice(-100);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Please sign in." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "gallery" || body.kind === "productFile" ? body.kind : "thumbnail";
    const productSlug = safeName(String(body.productSlug || "untitled"));
    const filename = safeName(String(body.filename || "file"));
    const unique = crypto.randomUUID().slice(0, 8);

    const bucket = kind === "productFile" ? FILES_BUCKET : MEDIA_BUCKET;
    const subdir = kind === "productFile" ? "files" : kind === "gallery" ? "gallery" : "thumbnails";
    const path = `${productSlug}/${subdir}/${unique}-${filename}`;

    const { data: signed, error: signErr } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(path);
    if (signErr || !signed) return json({ ok: false, error: "Could not create upload URL." }, 500);

    return json({
      ok: true,
      bucket,
      path,
      token: signed.token,
      uploadUrl: signed.signedUrl,
      publicUrl: bucket === MEDIA_BUCKET
        ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
        : null,
    });
  } catch (err) {
    console.error("[admin-get-upload-url] error:", err);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
