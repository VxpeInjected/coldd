---
name: coldd
description: Dark-mode Roblox & Minecraft asset storefront — graphite neutrals, one ember accent, flat fills and neutral elevation
colors:
  bg: "#15161b"
  bg-2: "#191b21"
  bg-3: "#1f2127"
  glass-top: "rgba(255,255,255,0.055)"
  glass-bot: "rgba(255,255,255,0.022)"
  frost: "rgba(17,18,24,0.74)"
  hairline: "rgba(255,255,255,0.09)"
  hairline-strong: "rgba(255,255,255,0.16)"
  fg: "#f4f6f9"
  fg-1: "#e2e6ec"
  fg-2: "#aab2c0"
  fg-3: "#6b7280"
  accent: "#ff4d44"
  accent-deep: "#e2382f"
  accent-press: "#cf2f27"
  accent-ink: "#ff8079"
  price: "#34e08a"
  minecraft-word: "#6cc25c"
  minecraft-fill: "#4a9a3f"
  star-gold: "#ffc24b"
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
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.035em"
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
rounded:
  pill: "980px"
  lg: "24px"
  md: "16px"
  sm: "12px"
  xs: "10px"
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
    backgroundColor: "{colors.accent-press}"
  button-ghost:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.fg}"
    typography: "{typography.sm}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "46px"
  button-ghost-hover:
    backgroundColor: "rgba(255,255,255,0.10)"
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
    backgroundColor: "{colors.frost}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  card-solid:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.lg}"
    padding: "50px 56px"
  card-product:
    backgroundColor: "{colors.bg-3}"
    rounded: "{rounded.md}"
    padding: "14px 16px 16px"
  product-add:
    backgroundColor: "rgba(255,255,255,0.06)"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    height: "40px"
    width: "100%"
  product-add-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "#ffffff"
  input-text:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.fg}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "46px"
  chip-filter:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.fg-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 15px"
  chip-filter-active:
    backgroundColor: "{colors.accent-deep}"
    textColor: "#ffffff"
  list-item-active:
    backgroundColor: "rgba(255,255,255,0.09)"
    textColor: "#ffffff"
    rounded: "9px"
    padding: "11px 13px 11px 12px"
---

# Design System: coldd

## Overview

**Creative North Star: "The Late-Night Workshop"**

coldd's origin story is the brief: a few people in a Discord trading builds late at night because what was for sale wasn't good enough. The system plays that literally — a near-black room (`#15161b`) with one warm light source. Everything else recedes into graphite neutrals so the ember accent reads as *the* signal in the room rather than one colour among several. Ember appears on CTAs, the hero's swapped platform word, active filter chips, focus rings and small state marks. It never fills a background band, never washes the page, and never tints a shadow.

The atmosphere is scoped, not ambient. A blurred banner photograph sits behind the **top of the document only** — `position: absolute`, `height: max(104vh, 940px)`, `blur(14px)` — with a scrim gradient that resolves fully to `var(--bg)` by 88%. Below the fold, panels sit on clean graphite. Depth comes from three flat ingredients: a barely-there white gradient inside glass panels, a 1px hairline ring, and a neutral black shadow. Panels that need real separation from a photograph (filter rail, product buy card, dashboard, checkout, blog, legal) add a genuine `backdrop-filter: blur(13px) saturate(130%)` over `rgba(17,18,24,0.74)`.

Type is Archivo throughout, loaded from Google Fonts at 400/500/600/700/800/900 on every page. The scale is a whole-pixel ramp — `--t-display` down to `--t-nano` — with no half-pixel step anywhere in the stylesheet. Display type is heavy and tightly tracked (800 weight, -0.04em); body copy is relaxed (1.55 line-height, -0.006em) for long product and legal text. Buttons and chips are full pills; cards and tiles are soft rectangles. Interactive things are pills, informational surfaces are rectangles.

**Key Characteristics:**
- One accent colour, used rarely, always meaning "act here" or "you are here"
- Flat fills — no gradient buttons, no coloured glows, no tinted halos
- Neutral four-step elevation (`--e-1` … `--e-4`); shadows are black, never accent-tinted
- Scoped atmosphere: the blurred banner belongs to the top of the page, not the whole scroll
- Archivo on a whole-pixel ramp — integer sizes only
- Cards lift 2px on hover; buttons never lift, they change fill
- No light mode — a committed dark system, not a dark variant of a light one

## Colors

Graphite neutrals carry all structure; one warm ember carries all emphasis; green is reserved for money and for the Minecraft platform.

### Primary
- **Ember** (`--accent`): The signal colour. Focus rings (`outline: 2px solid`), the hero's swapped platform word, active tab underlines, small state marks (checkbox tick, range fill, radio dot, carousel dot), inline links inside legal and body copy, and button hover fill. Never a page background, never a shadow tint.
- **Ember Deep** (`--accent-deep`): The resting fill of every primary action — buttons, active filter chips, discount badges, the product-card add button on hover. Ember Deep is the *default* state and Ember is the *hover* state; the fill steps **up** in brightness on intent.
- **Ember Press** (`--accent-press`): Active/pressed fill for primary buttons and the product add button.
- **Ember Ink** (`--accent-ink`): Declared in `:root` for a lighter ember-on-dark text tint. Currently unused in the stylesheet — treat it as available, not as established.

### Secondary
- **Minecraft Word** (`--minecraft-word`, hard-coded literal, not a `:root` token): The hero headline's swapped word when the storefront is Minecraft-scoped.
- **Minecraft Fill** (`--minecraft-fill`, hard-coded literal): The `.btn-minecraft` resting fill, hover `#58ad4a`, active `#418a37`. Only ever appears in explicitly Minecraft-scoped UI.
- **Price Green** (`--price`): Prices, totals, "you saved" figures, the cart total once it has items, secure-checkout confirmations, success messages. A different green from Minecraft's on purpose.

### Tertiary
- **Star Gold** (`--star-gold`, hard-coded literal): Filled review stars on product cards and product detail. The only warm-yellow in the system; it exists so ratings do not read as another CTA.

### Neutral
- **Void** (`--bg`): Page base, behind everything.
- **Surface** (`--bg-2`): The next layer up — legal cards (which deliberately opt out of translucency for reading contrast), mobile nav overlay, disabled product-add fill.
- **Surface Raised** (`--bg-3`): Product cards, free cards, inputs with a solid fill, dropdown triggers, filter chips, code badges. Reads as a distinct block against Surface.
- **Frost** (`--frost`): The translucent panel fill used with `backdrop-filter: blur(13px) saturate(130%)` on the filter rail, product buy card, dashboard, checkout, blog and post panels.
- **Ink** (`--fg`): Primary text, headings, button labels.
- **Ink Body** (`--fg-1`): One step below primary — dense body text inside panels, list rows, review bodies, feature lists, menu options, the hero sub-headline. Previously referenced by 19 rules without ever being defined; it is now a real token.
- **Ink Muted** (`--fg-2`): Secondary text, descriptions, nav links at rest, sub-labels.
- **Ink Faint** (`--fg-3`): Tertiary text, placeholders, meta, disabled, struck-through prices.
- **Hairline** (`--hairline`): The resting border and divider value for the whole system.
- **Hairline Strong** (`--hairline-strong`): The hover border. When a card or tile is hovered, the border steps from Hairline to Hairline Strong — this is the system's standard "you are pointing at this" cue, and it is neutral.

### Named Rules

**The One Ember Rule.** Ember means "act here" or "you are here". It is never decoration, never a background band, never a glow. If a new element wants red so it will stand out, it is asking to compete with a CTA — give it a neutral and let the CTA win. Where a grid would repeat ember many times over (the product grid's twelve add buttons), the accent is deferred to hover: the card states its action quietly until you reach for it.

**The Two Greens Rule.** Price Green and Minecraft Green are not interchangeable. Price Green means "this number is good news". Minecraft Green means "you are on the Minecraft side of the site". Never let one bleed into the other's context, and never introduce a third green for a generic success state — use Price Green.

**The Neutral Border Rule.** Every resting border in the system is Hairline; every hover border is Hairline Strong. Accent-tinted borders are reserved for genuine selection on radio-style controls (`.pm-lic.active`, `.co-pay-btn.active`, `.pd-thumb.active`) and for input focus. Do not add a fourth border colour.

## Typography

**Display Font:** Archivo (with `'Helvetica Neue', Helvetica, Arial, sans-serif`)
**Body Font:** Archivo (same stack)
**Loading:** Google Fonts, weights 400;500;600;700;800;900, linked in the `<head>` of every page.

**Character:** One grotesque doing two jobs. Archivo's slightly squared, industrial letterforms hold up at 800 weight and -0.04em tracking without turning into a logo; at body sizes the same face stays plain and quiet under a near-neutral -0.006em. Numerals in prices, counts and specs are set `tabular-nums` (`.num`, `.price`, `.hn`, `[data-num]`) so figures align in columns.

### Hierarchy
- **Display** (`--t-display`, 800, 1.03 line-height, -0.04em): Hero headline and page-head `h1` only.
- **Headline** (`--t-h2`, 700, 1.04, -0.035em): Section headers. Deliberately a full step below Display — section bands must not shout at hero volume.
- **Title** (`--t-h3`, 700, -0.035em): Card, modal and panel titles.
- **Lead** (`--t-lead`, 400, 1.55): Section sub-headers, page-head deck, large-card intro paragraphs.
- **Body** (`--t-body`, 400, 1.55, -0.006em): The document default. Long-form legal and post copy runs 15–16px at 1.75 line-height.
- **Medium** (`--t-md`, 400): Panel paragraphs, review copy, legal paragraphs.
- **Small** (`--t-sm`, 600 in controls, 500 in prose, -0.004em on buttons): Buttons, table cells, list rows, form values.
- **Label** (`--t-label`, 600): Nav links, chips, badges, footer links, dropdown options, form labels.
- **Micro** (`--t-micro`, 600): Meta lines, hints, counts, timestamps.
- **Nano** (`--t-nano`, 700, 0.09em, uppercase): Group labels above filter and form sections, eyebrow tags on cards.

### Named Rules

**The Whole-Pixel Rule.** Font sizes are integers. The old system ran 9.5 / 10.5 / 11.5 / 12.5 / 13.5 / 14.5 / 15.5 / 16.5px alongside their integer neighbours — 127 declarations of noise pretending to be hierarchy. They were collapsed onto the ten ramp steps. A new size that is not already on the ramp is a request to reuse an existing step, not to add one, and a half-pixel size is never correct.

**The Body Floor Rule.** No text input, select or textarea renders under 16px at or below 640px. iOS Safari force-zooms the page on focus for any field under 16px and there is no way back out except a manual pinch. A single blanket override enforces this; never work around it with a narrower selector.

**The Two Intensities Rule.** Archivo is tight and heavy above 26px and plain below it. Do not carry display tracking (-0.04em) into body copy, and do not set body weight (400) on anything at Headline size or above.

## Layout

Centred container at `--maxw` (1280px) with 24px side padding (`.wrap`). Catalog surfaces widen: the shop and free-products bands run to 1760px with 40px padding so the product grid can breathe. Vertical rhythm between major homepage bands is a flat 104px (`.section-pad`).

The shop is a two-column grid — a 280px sticky filter rail (`top: 96px`) beside a fluid product grid that runs 3 columns by default, 4 above 1400px, 2 below 900px and 1 below 440px. Product detail is `minmax(0,1fr) 364px` with a sticky right buy rail. Dashboard and admin are `244px / 220px` sidebar plus fluid main. Checkout is `1fr 388px`.

Component spacing runs a short scale: 8px inside controls, 16–20px grid gutters, 22–26px panel padding, 46–50px on large feature cards (resell, about), 50–56px on legal cards.

Responsive behaviour collapses in stages. The floating header is a self-contained pill (`.nav-inner`, 15px radius, 50px tall) fixed 12px from the top and centred — it shrinks its own internal gap on scroll rather than the page reflowing under it. Below 900px the inline nav links hide entirely and a hamburger opens the same `.nav-links` element as a full-screen overlay on an opaque `--bg-2` background. Multi-column grids step to 2 columns around 900px and 1 column around 440–560px. The hero's decorative mini-cards are removed outright below 920px rather than being squeezed — they belong to the two-column composition.

## Elevation & Depth

Depth is neutral and layered, never coloured. Four elevation tokens cover the whole system, and nothing outside them is tinted to an element's own colour. Structural separation comes from three stacked flat ingredients: a barely-there white gradient inside the panel, a 1px hairline ring, and a black shadow. Panels that must survive sitting over photography add a real `backdrop-filter: blur(13px) saturate(130%)` over `--frost`.

The `.glass` treatment is the base: a `linear-gradient(180deg, var(--glass-top), var(--glass-bot))` fill, `--e-3`, and a masked 1px ring whose gradient runs 11% → 5% → 3.5% white. That ring is near-even top to bottom by design; the old top-lit 28% white edge was the tell that the surface was decorative rather than structural.

The backdrop is scoped to the top of the document. It is `position: absolute` (not fixed), `max(104vh, 940px)` tall, `blur(14px)`, with a scrim that reaches `var(--bg)` at 88%. Below that height the page is clean graphite. The retired atmosphere — animated blur blobs, the radial red page wash, and the grain overlay — is kept as `display: none` no-ops so pages still emitting the markup render clean.

### Shadow Vocabulary
- **`--e-1`** (`0 1px 2px rgba(0,0,0,0.4)`): Pressed state. Primary and Minecraft buttons drop to this on `:active`.
- **`--e-2`** (`0 4px 12px -4px rgba(0,0,0,0.55)`): The resting shadow of a filled button. Small, tight, black.
- **`--e-3`** (`0 18px 44px -24px rgba(0,0,0,0.8)`): Glass panels at rest; cards and tiles on hover.
- **`--e-4`** (`0 30px 70px -34px rgba(0,0,0,0.88)`): The heaviest step — the expanded team panel and equivalent full-attention surfaces.

### Named Rules

**The Neutral Shadow Rule.** Nothing gets a shadow tinted to its own colour — buttons included. This inverts the system's previous doctrine. Red buttons get `--e-2`, green buttons get `--e-2`, glass panels get `--e-3`. If a shadow needs an `rgba()` with a hue in it, the design is asking for a glow; give it a border step or a fill step instead.

**The Cards Lift, Buttons Fill Rule.** Hover response is split by element class. Cards, tiles and product cards lift a uniform `translateY(-2px)`, step their border to Hairline Strong, and take `--e-3`. Buttons do not move at all — `.btn` transitions background, border-colour, colour and box-shadow, and nothing else. A button that lifts is a bug.

**The Flat Fill Rule.** Filled controls are one solid colour. No gradient buttons, no gradient chips, no gradient badges. Depth on a filled control comes from a real 1px white border (`rgba(255,255,255,0.14)` on primary, stepping to `0.24` on hover) plus a neutral shadow.

## Shapes

Two radius families chosen by function, not by size. **Pill** (`--rounded.pill`, 980px on `.btn`, 999px on chips and badges — functionally identical) is for anything you press or anything that reads as a token: buttons, filter chips, badges, tags, avatars' counters. **Soft rectangle** is for anything that contains content: 24px (`--r`) for full panels and glass cards, 16px (`--r-sm`) for product cards, buy cards, blocks and tiles, 12px for inputs and dropdown triggers, 10px for compact buttons, pager cells and the product add button, 9px for list rows and menu options.

Nothing uses a sharp 0px corner. Borders are uniformly 1px; the only 2px borders in the system are on thumbnail selection frames (`.pd-thumb`, `.pm-thumb`) and radio rings, where the border *is* the selection indicator.

### Named Rules

**The No Coloured Rail Rule.** A `border-left` heavier than 1px, in any accent colour, is banned system-wide. It is the most recognisable generated-UI tell. Vertical rails exist only as 1px hairlines used for structure — the sub-category indent (`.fc-subs`), legal clause indents (`.legal-clause`), and the dividers between hero statistics (`.hstat + .hstat`). Never colour them.

**The Pill/Rectangle Rule.** If you press it, it is a pill. If you read it, it is a soft rectangle. Never mix the two on the same element type, and never introduce a "barely rounded" 4–6px corner between the families.

## Components

### Buttons
- **Shape:** Full pill (980px), `min-height: 46px`, `padding: 12px 22px`, `--t-sm` at 600 weight with -0.004em tracking. Compact contexts override height only (nav CTA 38px, dashboard row actions 36px, hero CTA 50px).
- **Primary:** Flat `--accent-deep` fill, white text, `1px solid rgba(255,255,255,0.14)` border, `--e-2`. No gradient, no coloured glow.
- **Hover / Active:** Hover steps the fill up to `--accent` and the border to `rgba(255,255,255,0.24)`. Active drops to `--accent-press` and `--e-1`. The button does not move.
- **Ghost:** `--glass-top` fill, Hairline border, Ink text. Hover fills to `rgba(255,255,255,0.10)` and borders to Hairline Strong. The default partner beside a Primary.
- **Minecraft:** Same flat-fill pattern in the Minecraft palette; only ever in Minecraft-scoped UI.
- **Disabled:** `--bg-3` fill, `--fg-3` text, Hairline border, no shadow.
- **Focus:** `outline: 2px solid var(--accent)` at `3px` offset. The focus ring is the one place ember is allowed on an otherwise neutral control.

### Chips
- **Filter chip:** `--bg-3` fill, Hairline border, `--fg-2` text, pill, 8px/15px padding. Hover lightens text and steps the border.
- **Active:** Solid `--accent-deep` fill, white text, transparent border. The filter row is a single-choice control where the chosen chip *is* the current view, so it earns the accent.
- **Overlay chip:** On photography, a `rgba(8,10,14,0.5)` fill with `backdrop-filter: blur(8px)` and a Hairline border.

### Cards / Containers
- **Corner Style:** 24px (`--r`) for panels, 16px (`--r-sm`) for cards and blocks.
- **Background:** Three families — `.glass` (translucent gradient, for modals, mega-menu, search panel, auth cards), frosted (`--frost` + `blur(13px) saturate(130%)`, for the filter rail, buy card, dashboard, checkout, blog and post panels), and solid (`--bg-2` for legal pages, `--bg-3` for product and free cards). Choose solid whenever reading contrast must not depend on what is behind the card.
- **Shadow Strategy:** `--e-3` at rest for glass; frosted panels add an inset 1px white top line plus a soft `-26px` spread black shadow.
- **Border:** 1px Hairline, plus the masked gradient ring on `.glass` only. `.legal-card` explicitly disables the ring.
- **Hover:** 2px lift, border to Hairline Strong, `--e-3`. Press feedback on linked tiles is `scale(0.99)` — the tinted expanding ripple is retired.
- **Internal Padding:** 46–56px on large feature and legal cards, 22–26px on standard panels, 14–16px on product cards.

### Product Cards
- **Style:** Solid `--bg-3` fill, 16px radius, Hairline border, 168px cover thumbnail. Product photography needs a stable, non-competing background, so product cards are never glass.
- **Price:** Price Green, with the struck-through original in `--fg-3` beside it. A discount badge (`--accent-deep`, 8px radius) overlays the thumbnail's top-left; an ownership badge overlays the top-right.
- **Add to cart (`.p-add`):** Ghost by default — `rgba(255,255,255,0.06)` fill, Hairline border, Ink text, 10px radius, 40px tall, pinned to the card bottom. It goes ember on hover (`--accent-deep` fill, white text) and `--accent-press` on active. This is the One Ember Rule applied to a repeating grid: twelve identical filled-red buttons would spend the accent on wallpaper.

### Inputs / Fields
- **Style:** `rgba(255,255,255,0.04)` fill, Hairline border, 12px radius, 46px min-height, Ink text, `--t-sm`. Solid variants on toolbars use `--bg-3`; variants over dark panels use `rgba(0,0,0,0.25)`.
- **Focus:** Border shifts to `rgba(255,77,68,0.5)` and the fill lightens to `rgba(255,255,255,0.06)`. Container-level fields use `:focus-within` for the same effect. There is no glow ring.
- **Invalid:** Border goes full `--accent`; the message below is `--t-micro` in `--accent`.
- **Mobile:** 16px floor at ≤640px (see the Body Floor Rule).

### Navigation
- **Style:** A single floating pill (`.nav-inner`), 15px radius, 50px tall, on its own dark gradient with a masked 1px ring. It becomes more translucent once scrolled past 12px and animates its internal gap when the inline search expands.
- **Links:** `--t-label` at 500 weight in `--fg-2`, 9px radius hit areas; hover lifts colour to Ink over a `rgba(255,255,255,0.06)` fill. `.nav-links a.active` resolves to Ink.
- **Mega menu:** A 560px panel of two-column category links; the hover arrow (`→`) is ember, the row fill is neutral.
- **Mobile:** Below 900px the links collapse into a hamburger that opens the same `.nav-links` element full-screen on opaque `--bg-2`, with 17px/600 rows separated by hairlines and a 16px search field.

### Selection & Filter Rail
- **Category rows (`.fc-cat`, `.fc-sub`):** Transparent at rest, `rgba(255,255,255,0.05)` on hover, and `rgba(255,255,255,0.09)` plus weight 600 and white text when active. Selection is carried by fill and weight — never by a coloured tab down the side.
- **Menu options (`.sort-opt`, `.adm-dd-opt`, `.plat-opt`):** Same neutral-fill idiom; the accent appears only in the radio dot.
- **Checkboxes:** 18px, 6px radius; checked state borders in ember with a 10px ember tick that scales in.
- **Price range:** Hairline rail, ember fill, white 17px thumb with a 3px ember ring.

### Hero Statistics
Real figures set inline on one baseline, separated by 1px hairlines — 20px/700 number beside a `--t-sm` muted label, not a row of stat cards. The stacked big-number-over-tiny-uppercase-label arrangement is the generated landing page's default proof device; these figures are real, so they read as a sentence of facts. Below 560px they wrap to two lines and the divider only ever sits between neighbours on the same line.

### Scroll Reveal (motion)
`.reveal` defaults to `opacity: 1; transform: none`. The hidden state is scoped to `html.js`, a class set by a one-line inline script in every page's `<head>`; `app.js` then adds `.in` as elements enter the viewport. Delay helpers `.d1`–`.d5` step 60ms apart. Under `prefers-reduced-motion`, both the visible and `html.js` hidden states resolve to fully visible with no transition.

**The Visible-Without-JS Rule.** Content is visible by default and animation *removes* that default, never grants it. Any entrance effect must be written so that a blocked, failed or slow script leaves the page fully readable. This is a robustness constraint, not a stylistic preference — the legal pages once went permanently blank in exactly this way. Never author a `.reveal`-style effect whose resting state is `opacity: 0` outside an `html.js` scope.

## Do's and Don'ts

### Do:
- **Do** keep ember to CTAs, active states, focus rings, small state marks and the hero platform word. If it is the third or fourth red thing on screen, make it neutral.
- **Do** use flat fills on every filled control, with a white border and a neutral shadow for depth.
- **Do** reach for `--e-1` … `--e-4`. Every shadow in the system is one of those four or a close neutral relative.
- **Do** lift cards 2px on hover and step their border to `--hairline-strong`; leave buttons where they are and change their fill instead.
- **Do** pick font sizes off the ten-step ramp, integers only.
- **Do** keep form fields at 16px+ on mobile viewports, full stop.
- **Do** default new panels to `.glass`; switch to frosted (`--frost` + blur) when the panel sits over photography, and to solid `--bg-2` when reading contrast must not depend on the background.
- **Do** carry selection in list and menu UI with a neutral fill plus a weight step.

### Don't:
- **Don't** tint a shadow to an element's own colour. No red glow under a red button, no green glow under a green one.
- **Don't** give a button a gradient, a hover lift, or a coloured halo.
- **Don't** use a coloured `border-left` heavier than 1px as a selection or emphasis device anywhere.
- **Don't** reintroduce a half-pixel font size, or add an eleventh step to the type ramp.
- **Don't** put a fixed, full-page background image, a radial accent wash, a grain overlay, or an animated blob behind the page — all four were removed on purpose.
- **Don't** author an entrance animation whose resting state is invisible outside the `html.js` scope.
- **Don't** use Minecraft Green and Price Green interchangeably, or invent a third green for success states.
- **Don't** introduce a border colour beyond Hairline and Hairline Strong (accent borders are for radio-style selection and input focus only).
- **Don't** add a light mode or a second theme. This is a committed single dark system.
- **Don't** put a sharp 0px or barely-rounded 4–6px corner anywhere — it breaks the pill/rectangle language.
