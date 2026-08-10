# Showing coldd.dev instead of the Supabase project URL

Two places currently expose `ekinmytmudjwfaqaqswp.supabase.co` to customers:

1. **The download prompt.** Signed Storage URLs are served from the project
   origin, so a buyer who just paid sees a browser dialog citing a random
   subdomain they have never heard of.
2. **The Google sign-in consent screen.** Google shows the domain that
   receives the OAuth callback. That is Supabase's `/auth/v1/callback`, so
   the consent screen reads "to continue to ekinmytmudjwfaqaqswp.supabase.co".

Neither can be fixed from this repo alone. coldd.dev is served by GitHub
Pages, which is static hosting with no request handling, so there is nowhere
to put a same-origin reverse proxy. The domain has to terminate at Supabase.

The code side is already done and is a no-op until the infrastructure exists.

## What the code already does

`supabase/functions/_shared/download.ts` re-hosts signed download URLs onto
`PUBLIC_SUPABASE_URL` when that secret is set, and leaves them untouched when
it is not — so nothing breaks before the domain is live. The signature covers
the path and query, not the host, so changing the origin stays valid.

It also sets `Content-Disposition` from the original filename, stripping the
8-character storage prefix. That part is live now: downloads already save as
`combat-hud-kit.zip` rather than `3f9a1c02-combat-hud-kit.zip`.

## What you need to do

### 1. Enable the Supabase custom domain

Supabase → Project Settings → General → Custom Domains. It is a paid add-on
(about $10/month). Use a subdomain of coldd.dev, not the apex — the apex is
already pointed at GitHub Pages and cannot serve both:

    api.coldd.dev

Add the CNAME and TXT records Supabase gives you at your DNS provider, then
activate. Verify before continuing:

    curl -sI https://api.coldd.dev/storage/v1/ | head -1

### 2. Point the functions at it

    supabase secrets set PUBLIC_SUPABASE_URL=https://api.coldd.dev

Download URLs now say `api.coldd.dev`. No redeploy of the front end needed.

### 3. Move Google sign-in onto it

This is the part that only the custom domain can fix.

- Google Cloud Console → APIs & Services → Credentials → your OAuth client →
  **Authorised redirect URIs**: add
  `https://api.coldd.dev/auth/v1/callback`. Keep the old
  `*.supabase.co` URI until the change is confirmed working, then remove it.
- Set the OAuth consent screen's **Application home page** to
  `https://coldd.dev` and upload the logo, so the dialog is branded.
- Update `SUPABASE_URL` in `supabase-init.js` to `https://api.coldd.dev`.
  That single constant drives auth, functions and storage on the client.

Consent then reads "to continue to coldd.dev".

### 4. Optional: keep the anon key in step

If you rotate keys while doing this, `supabase-init.js` holds the publishable
key next to the URL. Both are meant to be public; only the service-role key
is a secret, and that never appears in this repo.

## If you would rather not pay for the add-on

A Cloudflare Worker in front of `api.coldd.dev` proxying to the project origin
does the same job on Cloudflare's free tier, at the cost of moving coldd.dev's
DNS to Cloudflare and maintaining the worker. The `PUBLIC_SUPABASE_URL` and
Google console steps above are identical either way.
