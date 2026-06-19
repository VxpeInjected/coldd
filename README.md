# coldd

Marketing + storefront site for **coldd**, a Roblox & Minecraft development studio.

Static site — no build step required to host. Just upload these files to the repo root
and turn on GitHub Pages.

## Deploy on GitHub Pages

1. Upload everything in this folder to your repository (keep it at the **root**, not in a subfolder).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose your branch and the **/ (root)** folder, then **Save**.
4. Your site goes live at `https://<username>.github.io/<repo>/`.

> The `.nojekyll` file is required — it tells GitHub Pages to serve the files as-is.
> Keep it in the upload.

## Files

| File | What it is |
|------|------------|
| `index.html` | Home page |
| `assets.html` | Roblox catalog (with category filters) |
| `minecraft.html` | Minecraft catalog |
| `about.html` | About page |
| `styles.css` | All styling |
| `app.js` | All behavior (nav, search, cart, product modal, payment picker) |
| `catalog.js` | Auto-generated search index of products + categories |
| `*.jpg`, `*.png` | Images |
| `.nojekyll` | Required for GitHub Pages |
| `build.py` | Dev helper (optional) — see below |

## Editing products

Products live as `<article class="product" data-cat="...">` blocks inside
`assets.html` (Roblox) and `minecraft.html` (Minecraft). Edit the name, price
(`.p-price`), and thumbnail there.

After changing products, regenerate the search index:

```bash
python3 build.py
```

This rewrites `catalog.js` (so search stays in sync) and the single-file preview
`coldd-site.html` (handy for previewing locally — **do not** rely on it for hosting).
`build.py` needs Python 3 and Pillow (`pip install Pillow`) only if you re-optimize images.

## Things to wire up before launch

- **Discord invite** — replace the `https://discord.gg/coldd` links with your real invite.
- **Checkout / Buy Now** — currently both the USD and Robux options hand off to Discord.
  Swap in your real payment links (e.g. Stripe for USD, a Roblox gamepass/group product
  for Robux) in `app.js`.
- **Robux rate** — `ROBUX_PER_USD` in `app.js` (currently 80) sets the USD→Robux conversion.

> Not affiliated with Roblox Corporation or Mojang/Microsoft.
