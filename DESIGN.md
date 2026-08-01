---
name: coldd
description: Dark-mode Roblox & Minecraft asset storefront with a single warm red accent over frosted glass panels
colors:
  base: "#15161b"
  surface: "#191b21"
  surface-raised: "#1f2127"
  glass-top: "rgba(255,255,255,0.065)"
  glass-bottom: "rgba(255,255,255,0.028)"
  hairline: "rgba(255,255,255,0.09)"
  ink: "#f4f6f9"
  ink-muted: "#aab2c0"
  ink-faint: "#6b7280"
  ember: "#ff4d44"
  ember-deep: "#e2382f"
  price-green: "#34e08a"
  minecraft-green: "#6cc25c"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(40px, 5.6vw, 66px)"
    fontWeight: 800
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(34px, 5vw, 52px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.012em"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    letterSpacing: "normal"
rounded:
  pill: "980px"
  lg: "24px"
  md: "16px"
  sm: "12px"
spacing:
  sm: "16px"
  md: "24px"
  lg: "52px"
  section: "104px"
components:
  button-primary:
    backgroundColor: "linear-gradient(180deg, #ff5247, #e23229)"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "linear-gradient(180deg, #ff6056, #e8392f)"
  button-ghost:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
  card-glass:
    backgroundColor: "linear-gradient(180deg, {colors.glass-top}, {colors.glass-bottom})"
    rounded: "{rounded.lg}"
  card-product:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
---

# Design System: coldd

## Overview

**Creative North Star: "The Late-Night Workshop"**

coldd's own origin story is the brief: "a few people in a Discord, trading builds late at night because what was for sale just wasn't good enough" (/about). The visual system plays that literally - a near-black room (`#15161b`) with one warm light source. Everything else recedes into dark neutrals so the ember-red accent (`#ff4d44`) reads as *the* signal in the room, not one color among several. It is used sparingly by design: CTA buttons, the active nav pill, price-adjacent highlights, and the hero headline's swapped word - never as a background fill or a decorative wash.

Surfaces are frosted glass, not solid panels: cards use a barely-there top-light gradient (5% white fading to 2.5%) over a blurred, dimmed banner photograph fixed behind the entire page (`.backdrop` + `.scrim` + `.glow`). The glass doesn't just sit on a color - it sits on an image, blurred into ambience, so panels feel like they're floating in front of something real rather than printed on a flat backdrop. This is confirmed, not incumbent-only: the system is deliberately atmospheric and photographic-dark, not a flat corporate dark-mode.

Type is Inter throughout, doing real work at scale: hero display type runs up to 66px at 800-weight with tight, almost condensed tracking (-0.04em), while body copy stays relaxed (1.55 line-height, -0.012em tracking) for long legal/product text. Buttons and chips are full pill radius (980px); cards and product tiles are softly rounded rectangles (16-24px) - the pill/rectangle split is deliberate: interactive, tappable things are pills, informational surfaces are rectangles.

**Key Characteristics:**
- One accent color, used rarely, always meaning "act here"
- Frosted glass over a blurred photographic backdrop, not a flat dark background
- Inter at two very different intensities: tight/heavy for display, relaxed for body
- Pills for actions, soft rectangles for content
- No light mode - this is a committed dark system, not a dark variant of a light one

## Colors

Near-monochrome dark neutrals carry structure; one warm accent carries all emphasis.

### Primary
- **Ember** (`#ff4d44`): The single accent. CTA button gradients, the active hero word, active nav/tab states, focus highlights. Used on a small minority of any given screen - its rarity is what makes it read as urgent/actionable.
- **Ember Deep** (`#e2382f`): Gradient partner to Ember on buttons and glows; darker end of the same hover-state gradients.

### Secondary
- **Minecraft Green** (`#6cc25c`): Platform-specific accent, used only when the Minecraft side of the storefront needs to visually distinguish itself from Roblox (the hero word swap, the Minecraft CTA button gradient). Never appears outside Minecraft-scoped UI.
- **Price Green** (`#34e08a`): Reserved for price/money-positive contexts. A different green from Minecraft Green on purpose - do not conflate the two; one means "this platform," the other means "this number is good news."

### Neutral
- **Void** (`#15161b`): Page base, behind everything.
- **Surface** (`#191b21`): The next layer up - dashboard rows, solid form backgrounds, and (as of this session) legal-page cards that intentionally opt out of glass transparency for readability.
- **Surface Raised** (`#1f2127`): Product cards, inputs, dropdowns - anything that needs to read as a distinct, slightly-lifted block against Surface.
- **Ink** (`#f4f6f9`): Primary text.
- **Ink Muted** (`#aab2c0`): Secondary text, descriptions, sub-labels.
- **Ink Faint** (`#6b7280`): Tertiary text, placeholders, disabled/meta text.
- **Hairline** (`rgba(255,255,255,0.09)`): The only border color in the system. Every card, input, and divider border resolves to this one value at full or partial opacity - do not introduce a second border color.

### Named Rules
**The One Ember Rule.** The accent color signals action or emphasis, never decoration. If a new element wants red "to stand out," that's a sign it should compete for attention with a CTA, which it should lose - use a neutral instead.

**The Two Greens Rule.** Price Green and Minecraft Green are not interchangeable even though both are green. Price Green = "you're getting a good number." Minecraft Green = "you're on the Minecraft side of the site." Never let one bleed into the other's context.

## Typography

**Display Font:** Inter (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
**Body Font:** Inter (same stack)

**Character:** One typeface doing two jobs - compressed and heavy at display sizes (tight tracking, 800 weight) to feel confident and current; open and relaxed at body sizes (1.55 line-height) so dense product descriptions and legal text stay readable.

### Hierarchy
- **Display** (800, `clamp(40px, 5.6vw, 66px)`, 1.03 line-height, -0.04em tracking): Hero headline only.
- **Headline** (700, `clamp(34px, 5vw, 52px)`, -0.02em tracking): Section headers ("New releases," "Featured products").
- **Title** (700-800, 26-27px): Card/modal/panel titles (auth modal `h1`, product detail title).
- **Body** (400, 16-17px, 1.55-1.62 line-height): Descriptions, paragraphs. Legal-card body copy runs 15.5px at 1.75 line-height - slightly larger line-height for long-form reading.
- **Label** (600, 13.5-14.5px): Buttons, nav links, form labels, badges. Nearly every interactive text element in the system sits in this narrow 13.5-14.5px band.

### Named Rules
**The Body Floor Rule.** No form input, select, or textarea renders under 16px at mobile widths - this was a real production bug (iOS Safari force-zooms any focused field under 16px) fixed this session with a blanket mobile override. Never reintroduce a sub-16px form field on narrow viewports.

## Layout

Centered container at `max-width: 1280px` (`--maxw`) with 24px side padding (`.wrap`); the shop grid widens to 1760px with 40px padding for denser product browsing. Vertical rhythm between major homepage sections is a consistent 104px (`.section-pad`). Component-level spacing runs a tight scale: 16px (default gap/gutter), 24px (card internal padding), up to 52px for large card padding (resell/about blocks).

Responsive behavior collapses in stages: primary nav links hide entirely under 900px in favor of a hamburger menu (fixed as of this session - it previously had no working open/close behavior at all); multi-column grids (bento, team, product) step down to 2 columns around 900px and 1 column around 560px. The floating header is a self-contained pill (`border-radius` inherited from `--r-sm`-scale), not a full-width bar - it stays centered and shrinks its own padding on scroll rather than the page reflowing under it.

## Elevation & Depth

Frosted glass over blur, confirmed with the user as the intended feel (not solid stacked panels). Depth comes from three things working together, not shadows alone: a blurred, fixed, dimmed banner photo behind the entire page (`.backdrop`); a soft top-light gradient inside every glass card (`.glass`, 6.5% white fading to 2.8%); and a thin 1-pixel gradient border that fades from visible at the top to invisible at the bottom, simulating a highlight catching the top edge of glass. Drop shadows exist but are secondary - they ground buttons and floating elements (nav pill, cart FAB, modals) rather than being the primary depth cue.

### Shadow Vocabulary
- **CTA lift** (`box-shadow: 0 12px 30px -12px rgba(255,77,68,0.55)`, hover: `0 16px 38px -12px rgba(255,77,68,0.62)`): Primary buttons only - a colored glow matching the button's own gradient, intensifying on hover alongside a 2px upward translate.
- **Panel float** (`box-shadow: 0 26px 60px -28px rgba(0,0,0,0.85)`): Glass cards, dropdowns, modals - a large, soft, dark shadow that reads as "floating above the backdrop," not a tight drop shadow.

### Named Rules
**The Colored-Glow Rule.** Only buttons get shadows tinted to their own color (red glow on red buttons, green on the Minecraft button). Structural surfaces (cards, dropdowns, nav) always use a neutral black shadow regardless of any accent nearby.

## Shapes

Two radius families, chosen by function, not by size. **Pill** (`980px`) is exclusively for anything you press: buttons, nav tabs, chips, badges, the currency switcher. **Rectangle-with-soft-corners** (16-24px, `--r-sm` / `--r`) is for anything you read or contain content in: cards, modals, product tiles, panels. Nothing in the system uses a sharp 0px corner or a small "just barely rounded" 4-8px corner - the two established radii are deliberately far apart so the pill/rectangle distinction stays legible at a glance.

Borders are uniformly 1px `hairline` (`rgba(255,255,255,0.09)`) - never a heavier or differently-colored border anywhere in the system, including on hover/focus states (which shift opacity, not color).

## Components

### Buttons
- **Shape:** Full pill (`border-radius: 980px`), `min-height` typically 46-50px depending on context.
- **Primary:** Red gradient (`#ff5247` → `#e23229`), white text, colored glow shadow. Reserved for the single most important action on a given screen/card.
- **Ghost:** Translucent glass-top background (`rgba(255,255,255,0.065)`), hairline border, ink text - the default for secondary actions sitting next to a Primary button.
- **Platform variant (Minecraft):** Same pill/gradient pattern as Primary but in the Minecraft-green palette - only ever appears where the UI is explicitly Minecraft-scoped (platform picker, Minecraft CTA).
- **Hover / Focus:** All buttons lift 2px on hover (`transform: translateY(-2px)`) with a simultaneously intensifying shadow - this lift is the system's one consistent micro-interaction across every button variant.

### Cards / Containers
- **Corner Style:** 16-24px soft rounding (`--r-sm` / `--r`).
- **Background:** `.glass` gradient (frosted, translucent) for most cards; solid `Surface` (`#191b21`) for legal pages and other content where readability must not depend on what's behind the card.
- **Shadow Strategy:** Panel float shadow (see Elevation).
- **Border:** 1px hairline, with an additional gradient-masked highlight border on `.glass` cards specifically (fades top-to-bottom) - not present on solid-background cards.
- **Internal Padding:** 46-52px on large feature cards (resell, about), 16-24px on compact cards (product tiles, dashboard rows).

### Product Cards
- **Style:** Solid `Surface Raised` background (not glass - product photography needs a stable, non-competing background), 16px radius, hairline border.
- **Distinctive behavior:** Price renders in Price Green when the product carries an active discount; a red `-X%` badge overlays the thumbnail top corner. The "Add to Cart" action is a full-width Ghost-style button pinned to the card's bottom.

### Inputs / Fields
- **Style:** Hairline border, 12px radius, `rgba(255,255,255,0.04)` translucent fill, Ink text.
- **Focus:** Border and background shift toward full-opacity hairline/glass values (no glow ring or color change - focus state stays within the neutral palette, only the accent-red is reserved for actionable emphasis, not for indicating focus).
- **Mobile:** Font-size floors at 16px regardless of the desktop 14-14.5px default (see Typography's Body Floor Rule).

### Navigation
- **Style:** A single floating pill (`.nav-inner`), not a full-width bar - centered, fixed, with its own glass-dark gradient background independent of the page's own glass system. Shrinks its internal gap and switches to a translucent "scrolled" background once the page scrolls past 12px.
- **States:** Active/current nav item does not currently get a distinct treatment beyond hover (this is incumbent behavior, not a confirmed rule - flag if a future task wants to add one).
- **Mobile:** Primary links collapse under 900px into a hamburger button that opens the same nav content as a full-screen overlay panel (solid `Surface` background, not glass - deliberately opaque so link text stays fully legible over whatever page content is behind it).

## Do's and Don'ts

### Do:
- **Do** keep the red accent to CTAs, active states, and the platform-swap hero word - if you're using it for a third or fourth element on the same screen, pick a neutral instead.
- **Do** use the pill radius (980px) for anything pressable and the soft-rectangle radius (16-24px) for anything that contains content - never mix them on the same element type.
- **Do** default new cards to the `.glass` frosted treatment; only switch to solid `Surface` when there's a specific readability/robustness reason (as with the legal pages this session).
- **Do** keep form fields at 16px+ on mobile viewports, full stop.
- **Do** give every button the 2px hover-lift + intensifying shadow - it's the one interaction pattern users should feel consistently everywhere.

### Don't:
- **Don't** introduce a second border color - every border in the system resolves to the one hairline value.
- **Don't** let content visibility depend on JavaScript succeeding. `.reveal`-class scroll animations are fine for homepage flourish but must never be the only thing making primary content visible (the legal-page bug fixed this session was exactly this failure mode).
- **Don't** use Minecraft Green and Price Green interchangeably - they mean different things even though both are green.
- **Don't** add a light mode or a second theme. This is a committed single dark system, not a dark variant of something else.
- **Don't** put a hard, sharp 0px or barely-rounded 4-8px corner anywhere - it breaks the pill/rectangle shape language the whole system depends on.
