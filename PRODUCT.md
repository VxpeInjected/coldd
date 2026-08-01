# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: plain static HTML/CSS/JS (no frontend framework), one shared `app.js`/`admin.js`/`styles.css` loaded across every page via `catalog.js`. Backend is Supabase (Postgres + Auth + Edge Functions), payments via Stripe (card) and a custom Roblox gamepass/Robux flow. Hosted as a static site (GitHub Pages) behind Cloudflare.

## Users

Confirmed with the user: buyers split roughly evenly between two groups, not one dominant persona -
- **Solo/hobbyist developers** building their own Roblox or Minecraft game/server, often first-timers, price-sensitive, want a working result without hiring anyone.
- **Small studios/teams** already shipping or monetizing experiences, buying production-grade assets on a deadline.

Both groups shop the same catalog and checkout; there is no separate tier or experience for either today.

## Product Purpose

coldd sells ready-to-use digital assets for Roblox and Minecraft developers: finished games, game templates, maps, scripts/UI systems, graphics, buildings, vehicles, weapons, animations/VFX (Roblox) and hubs, lobbies, maps, builds, plugins, full server setups (Minecraft). Buyers get instant delivery of files after purchase and can resell certain products under a paid Resell Licence. Success = a developer goes from "needs an asset" to "shipped it in their game" without building it themselves.

## Positioning

The user was unsure of coldd's actual strategic edge over named competitors (BuiltByBit, ClearlyDev, Creator Store, tracked as revenue-comparison rows in the admin analytics panel) - this is recorded as the site's own stated claim, not independently confirmed:

> "In-house, no outsourcing, no filler" - every product is made internally by the team (not resold/outsourced), delivered instantly on purchase, with support that doesn't disappear after the sale. (Source: /about page copy, verbatim.)

Two structural features also differentiate the storefront mechanically, though the user did not confirm either is the primary strategic wedge:
- Direct **Robux payment** at checkout (via Roblox gamepass purchase + verification), not just card/PayPal - most competitors are card-only or require third-party conversion.
- **Resell Licence** option letting a buyer legally resell certain coldd products under their own storefront.

Do not present either of these, or the about-page copy, as *the* confirmed differentiator in new visual work - treat all three as candidate evidence, not settled positioning, until the user confirms.

## Operating Context

- Shopping is platform-scoped: every page/URL is either Roblox-side (`/assets`) or Minecraft-side (`/minecraft`), with a persistent platform toggle in the nav mega-menu and product filters.
- Checkout supports guest purchase (no account) or signed-in purchase; payment is Stripe (USD, card/wallet-based) or Robux (via linking a Roblox account and buying a per-order gamepass).
- Community lives on Discord (discord.gg/coldd) - referenced throughout the site as the support/community channel, and some products are Discord-gated "free" unlocks rather than direct downloads.
- A dashboard (post-purchase) covers order history, downloads, wishlist, a referral program with USD/Robux/store-credit payouts, and account/notification settings.
- An internal admin panel (staff-only, separate UI/JS from the storefront) manages products, orders, refunds, reviews, users/bans, sale events, discount codes, Roblox gamepass containers, blog/tutorials/releases, and staff roles.

## Capabilities and Constraints

- No native mobile app - mobile experience is the same responsive website (recently hardened: working hamburger nav, iOS zoom-on-input fix).
- Robux pricing is a real per-product admin-configured rate reflecting Roblox's DevEx markup, not a flat conversion - card/USD pricing is consistently cheaper than paying in Robux (site states "up to 50% cheaper").
- Digital delivery only; no physical goods. Downloads are gated behind a verified paid order (signed Storage URL), not open links.
- Minecraft-side inventory is new/still being populated as of this session - the storefront and category taxonomy are fully wired, but product count on that side is expected to grow from near-zero.
- Legal/business identity: operates under an Australian ABN, governed by Tasmania, Australia law per the Terms of Service; "coldd Development" is the registered operating name.

## Brand Commitments

- Name: **coldd** (storefront/product brand) under **coldd Development** (legal/company name).
- Visual identity already established and in production: dark theme, red/crimson accent (`#ff4d44`-family), glass/translucent card surfaces over a dark backdrop, Inter typeface. Not to be treated as greenfield - see incumbent CSS (`styles.css`) as design authority for any refinement work.
- Voice, per existing site copy: direct, confident, slightly informal ("we build what we'd actually want to buy," "no filler, no disappearing after the sale") - not corporate/formal.
- Not affiliated with Roblox Corporation or Mojang Studios (stated in every page footer) - never imply official endorsement by either platform.

## Evidence on Hand

- Real, live product catalog and reviews (Supabase-backed), not placeholder content - do not treat empty states (e.g. the Minecraft catalog being sparse right now) as something to fill with invented sample products.
- Real customer review copy exists in the DB (moderated, user-submitted) - never fabricate additional testimonials.
- No formal brand guideline doc, press kit, or case studies exist beyond the live site itself and its CSS.

## Product Principles

1. Instant, no-friction delivery - the product is judged partly on how fast a buyer goes from payment to working file in their game.
2. Serve hobbyists and studios with one catalog, not two - do not fork the experience by buyer sophistication.
3. In-house-made, not outsourced/resold - this claim is load-bearing for trust language sitewide; do not weaken or contradict it in new copy.
4. Platform parity - Roblox and Minecraft sides should feel like the same standard of product, not a primary line and an afterthought.
5. Support does not end at checkout - Discord community and post-purchase help are part of the product, not an add-on.

## Accessibility & Inclusion

No formal accessibility standard was specified by the user. This session fixed several concrete regressions found in production: legal-page text that could go permanently invisible if a browser's JS never ran, form inputs under 16px forcing iOS Safari to zoom on focus, and a mobile hamburger menu with no working navigation at all. Treat "content and core flows must never depend on JS succeeding to become visible/usable" as a working constraint until the user states otherwise.
