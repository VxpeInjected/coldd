---
name: coldd
description: Dark-mode Roblox & Minecraft asset storefront — graphite neutrals, one ember accent, flat fills, drawn icons and neutral elevation
colors:
  bg: "#15161b"
  bg-2: "#191b21"
  bg-3: "#1f2127"
  glass-top: "rgba(255,255,255,0.055)"
  glass-bot: "rgba(255,255,255,0.022)"
  hairline: "rgba(255,255,255,0.09)"
  hairline-strong: "rgba(255,255,255,0.16)"
  fg: "#f4f6f9"
  fg-1: "#e2e6ec"
  fg-2: "#aab2c0"
  fg-3: "#80899a"
  accent: "#ff4d44"
  accent-deep: "#e2382f"
  accent-ink: "#ff8079"
  price: "#34e08a"
  star: "#ffc24b"
  ok: "#6bd88a"
  ok-tint: "rgba(107,216,138,0.14)"
  warn: "#f6c454"
  warn-tint: "rgba(246,196,84,0.12)"
  info: "#7db8ff"
  info-tint: "rgba(70,140,255,0.12)"
  ink-25: "rgba(0,0,0,0.25)"
  ink-40: "rgba(0,0,0,0.4)"
  ink-60: "rgba(0,0,0,0.6)"
  ink-75: "rgba(0,0,0,0.75)"
  ink-85: "rgba(0,0,0,0.85)"
  frosted-fill: "rgba(17,18,24,0.74)"
  minecraft-word: "#6cc25c"
  minecraft-fill: "#4a9a3f"
  mc: "#4a9a3f"
  mc-hover: "#58ad4a"
  mc-press: "#418a37"
  warn-line: "rgba(246,196,84,0.28)"
  brand-stripe: "#8a83ff"
  brand-paypal: "#7b95d6"
  brand-crypto: "#e8b64c"
typography:
  display:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(40px, 5.6vw, 66px)"
    fontWeight: 800
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  h2:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(32px, 4.4vw, 48px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  h3:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  h4:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h5:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.006em"
  md:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  sm:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "-0.004em"
  label:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  micro:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  nano:
    fontFamily: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.09em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0"
rounded:
  xs: "4px"
  ctl: "10px"
  sm: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "50px"
  section: "104px"
components:
  button-primary:
    backgroundColor: "{colors.accent-deep}"
    textColor: "#ffffff"
    typography: "{typography.sm}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
  button-primary-active:
    backgroundColor: "#cf2f27"
  button-ghost:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.fg}"
    typography: "{typography.sm}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "46px"
  button-ghost-hover:
    backgroundColor: "rgba(255,255,255,0.10)"
  button-tinted:
    backgroundColor: "rgba(255,77,68,0.10)"
    textColor: "{colors.accent-ink}"
    typography: "{typography.sm}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "46px"
  button-tinted-hover:
    backgroundColor: "rgba(255,77,68,0.17)"
    textColor: "#ffffff"
  button-minecraft:
    backgroundColor: "{colors.minecraft-fill}"
    textColor: "#ffffff"
    typography: "{typography.sm}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "46px"
  button-minecraft-hover:
    backgroundColor: "#58ad4a"
  button-disabled:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.fg-3}"
    rounded: "{rounded.pill}"
  card-glass:
    backgroundColor: "linear-gradient(180deg, {colors.glass-top}, {colors.glass-bot})"
    rounded: "{rounded.lg}"
  card-frosted:
    backgroundColor: "{colors.frosted-fill}"
    rounded: "{rounded.sm}"
    padding: "22px 24px"
  card-solid:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.lg}"
    padding: "50px 56px"
  card-product:
    backgroundColor: "{colors.bg-3}"
    rounded: "{rounded.sm}"
    padding: "14px 16px 16px"
  card-blog:
    backgroundColor: "{colors.frosted-fill}"
    rounded: "{rounded.lg}"
    padding: "20px 22px 22px"
  filter-card:
    backgroundColor: "rgba(20,21,26,0.92)"
    rounded: "{rounded.sm}"
    padding: "18px"
  product-buy:
    backgroundColor: "{colors.accent-deep}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    height: "40px"
    width: "100%"
  product-buy-hover:
    backgroundColor: "{colors.accent}"
  product-add:
    backgroundColor: "rgba(255,77,68,0.10)"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    height: "40px"
    width: "100%"
  product-add-hover:
    backgroundColor: "rgba(255,77,68,0.17)"
    textColor: "#ffffff"
  input-text:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.fg}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "46px"
  input-compact:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    padding: "10px 12px"
  chip-filter:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.fg-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 15px"
  chip-filter-active:
    backgroundColor: "rgba(255,255,255,0.11)"
    textColor: "#ffffff"
  list-item-active:
    backgroundColor: "rgba(255,255,255,0.09)"
    textColor: "#ffffff"
    rounded: "{rounded.ctl}"
    padding: "11px 13px 11px 12px"
  pay-tile:
    backgroundColor: "{colors.ink-25}"
    textColor: "{colors.fg-2}"
    typography: "{typography.md}"
    rounded: "{rounded.sm}"
    padding: "15px 18px"
  pay-tile-active:
    backgroundColor: "rgba(255,255,255,0.06)"
    textColor: "{colors.fg}"
---

# Design System: coldd

## Overview

**Creative North Star: "The Late-Night Workshop"**

coldd's origin story is the brief: a few people in a Discord trading builds late at night because what was for sale wasn't good enough. The system plays that literally — a near-black room (`--bg`) with one warm light source. Everything else recedes into graphite neutrals so the ember accent reads as *the* signal in the room rather than one colour among several. Ember appears on primary buttons, the hero's swapped platform word, focus rings, small state marks and inline links. It never fills a background band, never washes the page, and never tints a shadow.

The atmosphere is scoped, not ambient. A blurred banner photograph sits behind the **top of the document only** — `position: absolute`, `height: max(104vh, 940px)`, `blur(14px)` — with a scrim gradient that resolves fully to `var(--bg)` by 88%. Below the fold, panels sit on clean graphite. Depth comes from three flat ingredients: a barely-there white gradient inside glass panels, a 1px hairline ring, and a black shadow drawn from the five-step ink scale. Panels that need real separation from a photograph (product buy rail, dashboard, checkout, blog, post, tutorial) add a genuine `backdrop-filter: blur(13px) saturate(130%)` over the frosted fill.

Everything that looks like an icon is drawn. Stars are authored SVG, arrows and chevrons are `mask-image` shapes tinted with `currentColor`, ticks are two rotated borders. There is not one glyph-as-icon left in the stylesheet. Type is Archivo throughout, on a whole-pixel ramp with a real heading ladder between 17px and 30px. Buttons and chips are full pills; cards and tiles are soft rectangles on a five-step radius scale. Interactive things are pills, informational surfaces are rectangles.

**Key Characteristics:**
- One accent colour, used rarely, always meaning "act here" or "you are here"
- Flat fills — no gradient buttons, no coloured glows, no tinted halos
- Neutral four-step elevation (`--e-1` … `--e-4`) over a five-step black-alpha scale (`--ink-25` … `--ink-85`); zero raw `rgba(0,0,0,…)` literals outside `:root`
- Five radius steps and nothing else, plus `50%` for circles
- Icons are drawn geometry, never typed characters
- Selection is a neutral fill plus a weight step, never a coloured side-tab
- Archivo on a whole-pixel ramp — integer sizes only, 11px floor
- Cards lift 2px on hover; buttons never lift, they change fill
- No light mode — a committed dark system, not a dark variant of a light one

## Colors

Graphite neutrals carry all structure; one warm ember carries all emphasis; green is reserved for money, for status and for the Minecraft platform; the remaining hues are status-only and never decorative.

### Primary
- **Ember** (`--accent`): The signal colour. Focus rings (`outline: 2px solid`, 3px offset), the hero's swapped platform word, the product-detail tab underline, small state marks (checkbox tick fill, range thumbs, radio dot, carousel dot), inline links inside legal and body copy, and the primary button's hover fill. Never a page background, never a shadow tint.
- **Ember Deep** (`--accent-deep`): The resting fill of every primary action — `.btn-primary`, the card-level **Buy now**, discount badges, the currency-switcher thumb, the checked filter checkbox. Ember Deep is the *default* and Ember is the *hover*; the fill steps **up** in brightness on intent.
- **Ember Ink** (`--accent-ink`): The text colour of the tinted secondary action (`.btn-tinted`, `.p-add`). It is the only place a light ember reads as type rather than as fill.
- **Ember Press** (`#cf2f27`, hard-coded literal): The pressed fill of primary buttons and of the card-level Buy now. It is no longer a `:root` token; it appears twice as a literal.

### Secondary
- **Price Green** (`--price`): Prices, totals, "you saved" figures, the cart total once it has items, secure-checkout confirmations, the current download version. A different green from Minecraft's on purpose.
- **Minecraft Word** (`--minecraft-word`, hard-coded literal): The hero headline's swapped word when the storefront is Minecraft-scoped.
- **Minecraft Fill** (`--mc`) with **`--mc-hover`** and **`--mc-press`**: The `.btn-minecraft` state ladder. Minecraft is a second brand fill, not an accent, and it only ever appears in explicitly Minecraft-scoped UI. Its three states are tokens so the button steps like every other filled control.

### Payment brand marks
Three colours sit deliberately outside the palette because they are other companies' identities, not ours: Stripe `#8a83ff`, PayPal `#7b95d6`, Crypto `#e8b64c`. They are permitted **only** as the `fill`/`color` of the payment-method SVG inside `.co-pay-btn`, never as a surface, border or text colour. The tiles themselves share one neutral surface — the moment a brand colour becomes a background, four vendors start competing with each other and with the ember.

### Tertiary
- **Success** (`--ok`) with **Success Tint** (`--ok-tint`): One token for "this passed / this is fixed" — met password-checklist rows, the easiest tutorial difficulty, the "fix" release-kind badge. Two different greens used to both mean success; this is now the single value.
- **Warning** (`--warn`) with **Warning Tint** (`--warn-tint`): Pending and attention states in the dashboard and admin tables.
- **Info** (`--info`) with **Info Tint** (`--info-tint`): Neutral informational badges in the admin panel.
- **Star** (`--star`): Filled review stars on cards, on product detail and in the review form. The only warm-yellow in the storefront; it exists so ratings do not read as another CTA. Empty stars are the same drawn shape at `rgba(255,255,255,0.16)`.

### Neutral
- **Void** (`--bg`): Page base, behind everything.
- **Surface** (`--bg-2`): The next layer up — legal cards (which deliberately opt out of translucency for reading contrast), the mobile nav overlay and filter sheet, the disabled state of the card action buttons.
- **Surface Raised** (`--bg-3`): Product cards, free cards, chips, dropdown triggers, toolbars, code badges. Reads as a distinct block against Surface.
- **Frosted Fill** (`rgba(17,18,24,0.74)`, hard-coded literal, repeated ~8×): The translucent panel fill paired with `backdrop-filter: blur(13px) saturate(130%)` on the product buy rail, dashboard, checkout, blog cards, post rail and tutorial cards.
- **Ink** (`--fg`): Primary text, headings, button labels.
- **Ink Body** (`--fg-1`): One step below primary — dense body text inside panels, list rows, review bodies, feature lists, menu options, the hero sub-headline.
- **Ink Muted** (`--fg-2`): Secondary text, descriptions, nav links at rest, sub-labels.
- **Ink Faint** (`--fg-3`): Tertiary text, placeholders, meta, disabled, struck-through prices, neutral list bullets. Lifted from `#6b7280` so it clears WCAG AA 4.5:1 on all three surfaces while staying visibly below Ink Muted.
- **Hairline** (`--hairline`): The resting border and divider value for the whole system.
- **Hairline Strong** (`--hairline-strong`): The hover border. When a card or tile is hovered, the border steps from Hairline to Hairline Strong — the system's standard "you are pointing at this" cue, and it is neutral.
- **Ink 25 / 40 / 60 / 75 / 85** (`--ink-25` … `--ink-85`): The black-alpha scale. Every shadow, scrim, text-shadow and dark inset fill in the stylesheet snaps to one of these five steps.

### Named Rules

**The One Ember Rule.** Ember means "act here" or "you are here". It is never decoration, never a background band, never a glow. If a new element wants red so it will stand out, it is asking to compete with a CTA — give it a neutral and let the CTA win. Where a grid would repeat a solid ember many times over, only the primary action keeps the fill; its partner drops to the tint.

**The Two Greens Rule.** Price Green means "this number is good news". Minecraft Green means "you are on the Minecraft side of the site". Success Green (`--ok`) means "this passed". Never let one bleed into another's context, and never introduce a fourth green.

**The Five Blacks Rule.** Black is only ever `--ink-25`, `--ink-40`, `--ink-60`, `--ink-75` or `--ink-85`. A new `rgba(0,0,0,…)` literal outside `:root` is a regression — the file previously ran fifteen near-identical alphas in two notations.

**The Neutral Border Rule.** Every resting border is Hairline; every hover border is Hairline Strong. Accent-tinted borders are reserved for genuine radio-style selection (`.pm-lic.active`, `.co-pay-btn.active`, `.pd-thumb.active`, `.pm-thumb.active`), for input focus, and for the tinted button variant. Do not add a fourth border colour.

## Typography

**Display Font:** Archivo (with `'Helvetica Neue', Helvetica, Arial, sans-serif`)
**Body Font:** Archivo (same stack)
**Loading:** Google Fonts, weights 400;500;600;700;800;900, linked in the `<head>` of every page.

**Character:** One grotesque doing two jobs. Archivo's slightly squared, industrial letterforms hold up at 800 weight and -0.04em tracking without turning into a logo; at body sizes the same face stays plain and quiet under a near-neutral -0.006em. Numerals in prices, counts and specs are set `tabular-nums` (`.num`, `.price`, `.hn`, `[data-num]`, and clause numbers) so figures align in columns.

### Hierarchy
- **Display** (800, 1.03 line-height, -0.04em): Hero headline and page-head `h1` only. Two clamps exist: the hero at `5.6vw` and the page head at `6vw`, both spanning 40 → 66px.
- **Headline** (700, 1.04, -0.035em): Section headers (`.sec-head h2`). Deliberately a full step below Display — section bands must not shout at hero volume.
- **Title / 30px** (800, 1.1, -0.02em): Product-detail title and product-detail price, the team role plate.
- **Subtitle / 24px** (700–800, -0.02em): Modal titles, dashboard and admin figures, cart totals, related/FAQ section heads, post `h2`.
- **Section / 20px** (700, -0.02em): Blog-card titles, legal `h2`, drawer heads, panel sub-heads, release titles, hero statistic figures.
- **Lead** (400, 1.55): Section sub-headers, page-head deck, checkout section heads.
- **Body** (400, 1.55, -0.006em): The document default. Long-form legal and post copy runs 15–16px at 1.75 line-height.
- **Medium / 15px** (400–600): Panel paragraphs, legal paragraphs, product-card names, payment tile labels.
- **Small / 14px** (600 in controls, 500 in prose, -0.004em on buttons): Buttons, table cells, list rows, form values, category rows.
- **Label / 13px** (500–700): Nav links, chips, filter sub-rows, badges, footer links, dropdown options, form labels, card action buttons.
- **Micro / 12px** (600): Meta lines, hints, counts, timestamps, filter group labels.
- **Nano / 11px** (700, up to 0.09em, often uppercase): Eyebrow tags on cards, search group labels, difficulty and release-kind badges, review counts. This is the floor.
- **Mono** (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`): The only non-Archivo face in the system, and it is a system stack, never a webfont. Reserved for strings the user must read character by character — the account-deletion confirmation code and the ABN in the legal pages. It is not a texture: monospace as a costume for "technical" is not a use.

### Named Rules

**The Whole-Pixel Rule.** Fixed font sizes resolve to exactly ten values: 11, 12, 13, 14, 15, 16, 17, 20, 24, 30. Half-pixel sizes (the old 9.5 → 16.5 ladder, 127 declarations of noise pretending to be hierarchy) are gone and are never correct. A new size that is not on the ramp is a request to reuse an existing step, not to add one.

**The Eleven Floor Rule.** Nothing renders below 11px. 10px text was raised to the floor rather than kept as a "smaller than small" step.

**The Body Floor Rule.** No text input, select or textarea renders under 16px at or below 640px. iOS Safari force-zooms the page on focus for any field under 16px and there is no way back out except a manual pinch. A single blanket override enforces this; never work around it with a narrower selector.

**The Two Intensities Rule.** Archivo is tight and heavy at 24px and above and plain below it. Do not carry display tracking (-0.04em) into body copy, and do not set body weight (400) on anything at 24px or above.

## Layout

Centred container at `--maxw` (1280px) with 24px side padding (`.wrap`). Catalog surfaces widen: the shop and free-products bands run to 1760px with 40px padding so the product grid can breathe. Vertical rhythm between major homepage bands is a flat 104px (`.section-pad`).

The shop is a two-column grid — a 280px sticky filter rail (`top: 96px`) beside a fluid product grid, 32px gutter. The grid runs 3 columns by default, 4 above 1400px, 2 below 900px and 1 below 440px. Product detail is `minmax(0,1fr) 364px` with a sticky right buy rail (34px gutter). Checkout is `1fr 388px`. Dashboard and admin are `244px` sidebar plus fluid main. The tutorial hub is `244px 1fr`; post detail is `minmax(0,1fr) 260px`.

Component spacing runs a short scale: 8px inside controls, 16–20px grid gutters, 18–24px panel padding, 46–50px on large feature cards (resell, about), 50px/56px on legal cards.

Responsive behaviour collapses in stages, and the nav breakpoint is deliberately not the page breakpoint. The floating header is a self-contained pill (`.nav-inner`, 16px radius, 50px tall) fixed 12px from the top and centred; it shrinks its own internal gap on scroll rather than the page reflowing under it. **At 1100px** the inline nav links hide and a hamburger opens the same `.nav-links` element as a full-screen overlay on opaque `--bg-2` — wider than the 900px used for content because the centred nav pill and the right-pinned cart pill physically collide before then. **At 1040px** the filter rail stops being a rail and becomes a bottom sheet (`translateY(101%)`, 82vh max, `--r` top corners) opened from an explicit button, scoped to `html.js` so a scriptless page keeps the panel in the flow. Multi-column grids step to 2 columns around 900px and 1 column around 440–560px. The hero's decorative mini-cards are removed outright below 920px rather than being squeezed — they belong to the two-column composition.

## Elevation & Depth

Depth is neutral and layered, never coloured. Four elevation tokens cover the whole system and every one of them is black. Structural separation comes from three stacked flat ingredients: a barely-there white gradient inside the panel, a 1px hairline ring, and a black shadow. Panels that must survive sitting over photography add a real `backdrop-filter: blur(13px) saturate(130%)` over the frosted fill, plus a `0 1px 0 rgba(255,255,255,0.05) inset` top line.

The `.glass` treatment is the base: a `linear-gradient(180deg, var(--glass-top), var(--glass-bot))` fill, `--e-3`, and a masked 1px ring whose gradient runs 11% → 5% → 3.5% white. That ring is near-even top to bottom by design; the old top-lit 28% white edge was the tell that the surface was decorative rather than structural.

The backdrop is scoped to the top of the document. It is `position: absolute` (not fixed), `max(104vh, 940px)` tall, `blur(14px)`, with a scrim that reaches `var(--bg)` at 88%. Below that height the page is clean graphite. The retired atmosphere — animated blur blobs, the radial red page wash, the grain overlay and the eyebrow pill — is kept as `display: none` no-ops so pages still emitting the markup render clean. The page loader (rings, pulsing logo, LOADING text) and its keyframes are deleted outright, as are `.pulse` and `@keyframes ping`.

### Shadow Vocabulary
- **`--e-1`** (`0 1px 2px rgba(0,0,0,0.4)`): Pressed state. Primary and Minecraft buttons drop to this on `:active`.
- **`--e-2`** (`0 4px 12px -4px rgba(0,0,0,0.55)`): The resting shadow of a filled button, and of the filter panel.
- **`--e-3`** (`0 18px 44px -24px rgba(0,0,0,0.8)`): Glass panels at rest; cards and tiles on hover.
- **`--e-4`** (`0 30px 70px -34px rgba(0,0,0,0.88)`): The heaviest step — the expanded team panel and equivalent full-attention surfaces.

Beyond the four tokens, bespoke shadows exist for drawers, menus and overlays; all of them draw their black from the ink scale (`0 18px 50px -22px var(--ink-75)`, `0 -30px 80px -30px var(--ink-85)`, and so on).

### Named Rules

**The Neutral Shadow Rule.** Nothing gets a shadow tinted to its own colour — buttons included. Red buttons get `--e-2`, green buttons get `--e-2`, glass panels get `--e-3`. If a shadow needs an `rgba()` with a hue in it, the design is asking for a glow; give it a border step or a fill step instead.

**The Cards Lift, Buttons Fill Rule.** Hover response is split by element class. Cards, tiles and product cards lift a uniform `translateY(-2px)`, step their border to Hairline Strong, and take `--e-3`. `.btn` transitions background, border-colour, colour and box-shadow, and nothing else. A `.btn` that lifts is a bug.

**The Flat Fill Rule.** Filled controls are one solid colour. No gradient buttons, no gradient chips, no gradient badges. Depth on a filled control comes from a real 1px white border (`rgba(255,255,255,0.14)` on primary, stepping to `0.24` on hover) plus a neutral shadow.

## Shapes

Radius is a five-step scale declared as tokens, and the page computes nothing else besides `50%` for circles:

- **`--r-xs` (4px)** — badges, code inline, tick and bar shapes, small icon plates.
- **`--r-ctl` (10px)** — the control radius: card action buttons, inputs in compact contexts, list rows, menu options, pager cells, thumbnails, overlay badges.
- **`--r-sm` (16px)** — panels and inner cards: product cards, the filter panel, the buy card, form fields, toolbars, the nav pill, segmented-control shells.
- **`--r` (24px)** — large cards and section surfaces: glass panels, blog cards, post covers, the mobile filter sheet's top corners.
- **`--r-pill` (999px)** — anything you press or anything that reads as a token: buttons, chips, badges, tags, rails, avatars' counters.

Two families chosen by function, not by size: **pill** for anything you press or that reads as a token; **soft rectangle** for anything that contains content. Nothing uses a sharp 0px corner except the filter panel once it becomes a full-bleed mobile sheet. Borders are uniformly 1px; the only heavier borders are on thumbnail selection frames (`.pd-thumb`, `.pm-thumb`, 2px), radio rings (2px) and a few 1.5px checkbox/licence outlines, where the border *is* the selection indicator.

### Named Rules

**The Five Steps Rule.** 4 / 10 / 16 / 24 / 999, plus `50%` for circles. The system previously ran 18 distinct radius values between 2px and 999px with no relationship between them. A sixth step is not a design decision, it is drift.

**The No Coloured Rail Rule.** A `border-left` heavier than 1px, in any accent colour, is banned system-wide. It is the most recognisable generated-UI tell. Vertical rails exist only as 1px hairlines used for structure — the sub-category indent (`.fc-subs`), legal clause indents (`.legal-clause`), the dividers between hero statistics (`.hstat + .hstat`) and between about-page figures. Never colour them.

**The Pill/Rectangle Rule.** If you press it, it is a pill. If you read it, it is a soft rectangle. Never mix the two on the same element type, and never introduce a "barely rounded" 6px corner between `--r-xs` and `--r-ctl`.

## Components

### Buttons
- **Shape:** Full pill (999px), `min-height: 46px`, `padding: 12px 22px`, 14px at 600 weight with -0.004em tracking, 8px gap for an icon. Compact contexts override height only (nav CTA 44px, dashboard row actions 36px, hero CTA 50px at 15px).
- **Primary:** Flat `--accent-deep` fill, white text, `1px solid rgba(255,255,255,0.14)` border, `--e-2`. Hover steps the fill up to `--accent` and the border to `rgba(255,255,255,0.24)`. Active drops to `#cf2f27` and `--e-1`. The button does not move.
- **Tinted:** Ember as a tint, not a fill — `rgba(255,77,68,0.10)` background, `rgba(255,77,68,0.34)` border, `--accent-ink` text. Hover goes `0.17` / `0.5` / white text; active settles at `0.13`. This is the **secondary half of a buy pair**: it reads as a real commerce action while leaving Primary as the page's one solid ember.
- **Ghost:** `--glass-top` fill, Hairline border, Ink text. Hover fills to `rgba(255,255,255,0.10)` and borders to Hairline Strong; active returns to `0.06`. The default partner beside a Primary in non-commerce contexts.
- **Minecraft:** Same flat-fill pattern in the Minecraft palette; only ever in Minecraft-scoped UI.
- **Disabled:** `--bg-3` fill, `--fg-3` text, Hairline border, no shadow, `cursor: not-allowed`.
- **Focus:** `outline: 2px solid var(--accent)` at `3px` offset. The focus ring is the one place ember is allowed on an otherwise neutral control.
- **Loading:** `.is-loading` drops opacity to 0.55, hides `.btn-label` and centres a 16px spinner. Same construction on `.auth-submit`.

### The Buy Pair
One rule across catalog cards, product detail and the quick-view modal: **Buy now is the filled ember primary and comes first; Add to cart follows as the tinted variant.** On product detail (`.pd-cta`) and in the modal (`.pm-actions`) the pair is `.btn-primary` + `.btn-tinted`, flexed to equal widths. On the card (`.p-actions`) it is a `1.25fr 1fr` grid with an 8px gap, giving Buy the wider column. Owned products collapse the grid to a single column and hide Buy. Below 380px the pair stacks.

### Product Cards
- **Style:** Solid `--bg-3` fill, `--r-sm` radius, Hairline border, 168px cover thumbnail, `14px 16px 16px` body. Product photography needs a stable, non-competing background, so product cards are never glass.
- **Price:** Price Green at 17px/700, with the struck-through original in `--fg-3` beside it. A discount badge (`--accent-deep`, `--r-ctl`) overlays the thumbnail's top-left; an ownership badge overlays the top-right.
- **Rating:** Drawn SVG stars at 13px with a real dimmed empty state (`rgba(255,255,255,0.16)`), filled in `--star`, followed by an 11px tabular review count. Never `★` / `☆`.
- **Actions (`.p-add`, `.p-buy`):** 40px tall, `--r-ctl`, 13px/700, full width of their grid column. Buy is `--accent-deep` with a `rgba(255,255,255,0.16)` border; Add is the tint. Both take `transform: scale(0.97)` on `:active` (suppressed when disabled), and **all hover styling is gated behind `@media (hover: hover) and (pointer: fine)`** so a tap does not leave a phone control stuck in its hovered state. Disabled is `--bg-2` / `--fg-3` / Hairline.
- **Hover:** 2px lift, border to Hairline Strong, `--e-3`.

### Chips
- **Filter chip (`.chip`):** `--bg-3` fill, Hairline border, `--fg-2` text at 13px/500, pill, 8px/15px padding. Hover lifts the text to Ink and steps the border to `rgba(255,255,255,0.2)`.
- **Active:** `rgba(255,255,255,0.11)` fill, white text, Hairline Strong border, weight steps to 600. Neutral, not ember.
- **Overlay chip:** On photography, a `rgba(8,10,14,0.5)` fill with `backdrop-filter: blur(8px)` and a Hairline border.

### Cards / Containers
- **Corner Style:** `--r` for panels and blog cards, `--r-sm` for product cards, buy cards and inner blocks.
- **Background:** Three families — `.glass` (translucent gradient + masked ring, for modals, mega-menu, search panel, auth cards), **frosted** (the frosted fill + `blur(13px) saturate(130%)`, for the buy rail, dashboard, checkout, blog, post and tutorial panels), and **solid** (`--bg-2` for legal pages, `--bg-3` for product and free cards). Choose solid whenever reading contrast must not depend on what is behind the card.
- **Shadow Strategy:** `--e-3` at rest for glass; frosted panels add an inset 1px white top line plus a `-26px` spread black shadow drawn from `--ink-75`.
- **Border:** 1px Hairline, plus the masked gradient ring on `.glass` only. `.legal-card` explicitly disables the ring.
- **Hover:** 2px lift, border to Hairline Strong, `--e-3`. Press feedback on linked tiles is `scale(0.99)`; the tinted expanding ripple is retired.
- **Internal Padding:** 46–56px on large feature and legal cards, 18–24px on standard panels, 14–16px on product cards.

### Inputs / Fields
- **Style:** `rgba(255,255,255,0.04)` fill, Hairline border, 46px min-height, Ink text at 14px. Full-size form fields (auth, checkout, dashboard) use `--r-sm`; compact and inline fields (filter search, coupon, price boxes) use `--r-ctl`. Solid variants on toolbars use `--bg-3`; variants over dark panels use `--ink-25`.
- **Focus:** Border shifts to `rgba(255,77,68,0.5)` and the fill lightens to `rgba(255,255,255,0.06)`. Container-level fields use `:focus-within` and add a real 2px accent outline. There is no glow ring.
- **Invalid:** Border goes full `--accent`.
- **Checkbox:** 18px site-wide, `--r-xs`, 1.5px Hairline border; checked fills `--accent` and draws a tick from two white borders rotated 45°. The filter-panel variant is 16px on `--ink-25`, fills `--accent-deep`, and scales its drawn tick in from 0.6.
- **Mobile:** 16px floor at ≤640px (see the Body Floor Rule).

### Navigation
- **Style:** A single floating pill (`.nav-inner`), `--r-sm` radius, 50px tall, on its own dark gradient with a masked 1px ring and `0 18px 50px -22px var(--ink-75)`. It becomes more translucent once scrolled and animates its internal gap when the inline search expands.
- **Links:** 13px at 500 weight in `--fg-2`, `--r-ctl` hit areas; hover lifts colour to Ink over a `rgba(255,255,255,0.06)` fill. `.nav-links a.active` resolves to Ink.
- **Mega menu:** A 560px panel of two-column category links over a faint watermark. The row is neutral; a **drawn** arrow mask fades and slides in from `translateX(-5px)` on hover. Platform tabs (`.nmt-tab`) select with `rgba(255,255,255,0.11)` plus Hairline Strong.
- **Mobile (≤1100px):** Links collapse into a hamburger that opens the same `.nav-links` element full-screen on opaque `--bg-2`, with 17px/600 rows separated by hairlines and a 16px search field. The currency switcher relocates into the panel so the header pill and the cart pill never collide.

### Filter Panel
The catalog filter reads as a tool panel bolted to the page, not a floating frosted card.
- **Surface:** Flat `rgba(20,21,26,0.92)`, `--r-sm`, Hairline border, `--e-2`. **No backdrop blur.**
- **Header:** Its own `rgba(255,255,255,0.028)` band at `15px 18px` with a real bottom rule and a 14px/700 title beside a compact "clear" button.
- **Sections:** `.fc-group` at 18px padding separated by full-bleed `border-top` rules, so the panel reads as stacked rows rather than free-floating groups.
- **Section headings:** Sentence case, 12px/600, `letter-spacing: 0`, `text-transform: none`, in `--fg-2`. The wide-tracked uppercase micro-caps are gone.
- **Category rows (`.fc-cat`, `.fc-sub`):** Transparent at rest, `rgba(255,255,255,0.05)` on hover (gated behind `hover: hover`), `rgba(255,255,255,0.09)` plus white text and weight 600 when active. An open group sits at `0.045`. Sub-lists indent behind a 1px hairline rail and open on `grid-template-rows: 0fr → 1fr` so nothing clips.
- **Price range:** Neutral rail (`rgba(255,255,255,0.11)`, 4px, pill) with a neutral selected span (`rgba(255,255,255,0.5)`); ember lives only on the thumbs, which is the part you actually drag.

### Checkout Payment Tiles
`.co-pay-btn` is one neutral surface per method: `--ink-25` fill, Hairline border, `--fg-2` label at 15px/700, `--r-sm`, `15px 18px`. Selection borders in ember with a 1px inset ember ring and lifts the fill to `rgba(255,255,255,0.06)`. **Brand colour lives only in the SVG mark** — Stripe `#8a83ff`, PayPal `#7b95d6`, crypto `#e8b64c`, Robux `--price` — never in the slab behind it. The Card/Robux switch above it (`.co-pay-tab`) selects neutrally at `rgba(255,255,255,0.11)`.

### Selection & Menus
- **Segmented and tab controls** (`.bt-opt`, `.nmt-tab`, `.co-pay-tab`, `.chip`) select on `rgba(255,255,255,0.11)` with white text inside a `--r-sm` shell.
- **List selection** (`.fc-cat`, `.fc-sub`) selects on `rgba(255,255,255,0.09)` plus a weight step.
- **Menu options** (`.sort-opt`, `.plat-opt`, `.adm-dd-opt`) use the same neutral-fill idiom; on the sort menu the accent appears only in the radio dot.
- **Radio-style selection** (`.pm-lic`, `.co-pay-btn`, `.pd-thumb`, `.pm-thumb`) is the one place a border may go ember, because there the border *is* the indicator.

### Icons
Every icon is drawn geometry.
- **Arrows** (`.lnk-arrow`, `.lnk-back`, `.co-back`, `.ico-arrow`, `.ico-ext`, `.has-arrow`, `[data-arrow]`): `0.95em` squares filled with `background-color: currentColor` and cut by `mask-image` from three `:root` data-URI SVGs (`--ico-arrow-r`, `--ico-arrow-l`, `--ico-ext`), with a `0.32em` gutter. They lean 3px into the direction of travel on hover, gated behind `@media (hover: hover) and (pointer: fine)`.
- **Chevrons and disclosures:** the FAQ `+`/`−` (`.pd-faq-item summary::after`), the download-history chevron (`.dl-history summary::before`) and the mega-menu arrow are all inline mask SVGs tinted `--fg-3` or `--fg-2`.
- **Ticks:** the filter checkbox, the site-wide checkbox, the password-checklist tick and the resell bullet are all two rotated borders, never a `✓` character.
- **Stars:** authored SVG at a fixed size (13px on cards and reviews, 15px on the homepage, 22px in the review form) with a dimmed empty state.

There are **zero** `content:` glyph icons in the stylesheet.

### Legal Clauses
`.legal-clause` indents behind a 1px Hairline `border-left` at 16px. The clause number is a real label — `.lc-num`, `min-width: 62px`, `margin-right: 10px`, `--fg` at 700 with tabular numerals — not an em-dash doing layout's job.

### Hero Statistics
Real figures set inline on one baseline, separated by 1px hairlines — a 20px/700 number beside a 14px muted label, not a row of stat cards. The stacked big-number-over-tiny-uppercase-label arrangement is the generated landing page's default proof device; these figures are real, so they read as a sentence of facts. Below 560px they wrap to two lines and the divider only ever sits between neighbours on the same line. The about-page figure band follows the same logic at `clamp(26px, 2.6vw, 34px)`.

### Scroll Reveal (motion)
`.reveal` defaults to `opacity: 1; transform: none`. The hidden state is scoped to `html.js`, a class set by a one-line inline script in every page's `<head>`; `app.js` then adds `.in` as elements enter the viewport. Delay helpers `.d1`–`.d5` step 60ms apart. Easing is `--ease` (`cubic-bezier(0.22, 1, 0.36, 1)`) for transforms and `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) for entrances and icon nudges. Under `prefers-reduced-motion`, both the visible and `html.js` hidden states resolve to fully visible with no transition, and a blanket rule caps every duration at 0.01ms.

**The Visible-Without-JS Rule.** Content is visible by default and animation *removes* that default, never grants it. Any entrance effect must be written so that a blocked, failed or slow script leaves the page fully readable. This is a robustness constraint, not a stylistic preference — the legal pages once went permanently blank in exactly this way. The same reasoning scopes the mobile filter sheet to `html.js`: without scripting the panel stays in the document flow rather than becoming unreachable.

## Do's and Don'ts

### Do:
- **Do** keep ember to primary actions, focus rings, small state marks and the hero platform word. If it is the third or fourth red thing on screen, make it neutral.
- **Do** put Buy now first as the filled primary and Add to cart second as `.btn-tinted`, on every surface that sells.
- **Do** draw every icon — SVG, `mask-image`, or borders. A typed `→`, `★`, `✓` or `▾` is a bug.
- **Do** gate hover styling on interactive controls behind `@media (hover: hover) and (pointer: fine)`, and give pressable controls a `scale(0.97)` `:active`.
- **Do** pick a radius from the five steps (`--r-xs`, `--r-ctl`, `--r-sm`, `--r`, `--r-pill`) or `50%` for a circle.
- **Do** draw every black from `--ink-25` … `--ink-85`, and every shadow from `--e-1` … `--e-4` or a neutral relative built on the ink scale.
- **Do** carry selection with a neutral fill (`rgba(255,255,255,0.09)` in lists, `0.11` in segmented controls) plus a weight step.
- **Do** lift cards 2px on hover and step their border to `--hairline-strong`; leave buttons where they are and change their fill instead.
- **Do** pick font sizes off the ten-step ramp, integers only, 11px floor.
- **Do** keep form fields at 16px+ on mobile viewports, full stop.
- **Do** default new panels to `.glass`; switch to frosted when the panel sits over photography, and to solid `--bg-2` when reading contrast must not depend on the background.
- **Do** use `--ok` / `--warn` / `--info` with their tints for status, and `--star` for ratings.

### Don't:
- **Don't** tint a shadow to an element's own colour. No red glow under a red button, no green glow under a green one.
- **Don't** give a button a gradient, a hover lift, or a coloured halo.
- **Don't** use a coloured `border-left` heavier than 1px as a selection or emphasis device anywhere.
- **Don't** write a raw `rgba(0,0,0,…)` outside `:root`, or add a sixth radius step.
- **Don't** reintroduce a half-pixel font size, a 10px size, or an eleventh ramp step.
- **Don't** type an icon as a character, and don't add a `content: "→"`-style pseudo-element icon.
- **Don't** select with an ember fill or an accent side-tab in list, tab, chip or segmented UI — ember borders are for radio-style selection and input focus only.
- **Don't** put a backdrop blur on the filter panel, or give its section headings wide-tracked uppercase micro-caps.
- **Don't** paint a payment tile in its brand colour; the mark carries the brand, the slab stays neutral.
- **Don't** put a fixed, full-page background image, a radial accent wash, a grain overlay, an animated blob, or a page loader behind the page — all five were removed on purpose.
- **Don't** author an entrance animation whose resting state is invisible outside the `html.js` scope.
- **Don't** use Minecraft Green, Price Green and Success Green interchangeably, or invent a fourth green.
- **Don't** introduce a border colour beyond Hairline and Hairline Strong.
- **Don't** add a light mode or a second theme. This is a committed single dark system.
