---
target: Homepage, dashboard, catalog, product page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-01T20-05-10Z
slug: rd-index-html-assets-index-html-product-index-html
---
Method: dual-agent (A: ab3495a970378bf96 - B: a3a15b9044f745136)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2/4 | Hero "Products" stat intermittently shows "0+" - likely CDN cache staleness, not new code |
| 2 | Match System / Real World | 3/4 | Domain vocabulary used correctly and consistently |
| 3 | User Control and Freedom | 3/4 | Typed-confirmation account deletion, easy license/currency toggling |
| 4 | Consistency and Standards | 2/4 | Two independent floating-pill patterns collide on mobile |
| 5 | Error Prevention | 3/4 | Password strength meter, reauth-before-security-change |
| 6 | Recognition Rather Than Recall | 3/4 | Persistent cart total, per-option license pricing visible up front |
| 7 | Flexibility and Efficiency of Use | 2/4 | Filters become an unavoidable ~1100px wall before mobile users see one product |
| 8 | Aesthetic and Minimalist Design | 3/4 | Docked for decorative (non-actionable) use of the accent color |
| 9 | Error Recovery | 2/4 | Disabled OAuth buttons give touch users zero explanation |
| 10 | Help and Documentation | 3/4 | FAQ + per-product contact line present and discoverable |
| Total | | 26/40 | Acceptable - significant work needed |

## Design Specificity Verdict
Authored for the niche (platform toggle, Robux switcher, resell-license mechanic, real key art), undercut by a generic payment marquee closing the homepage and some reused catalog thumbnails. Detector: 436 findings (21 warning, 415 advisory, 0 error) - bulk is design-system-* advisories expected right after writing DESIGN.md from a mature codebase. Real warnings: 10 layout-property transitions, 3 side-tab accent borders, 1 verified-false-positive broken-image, 2 likely-intentional monospace font uses.

## Priority Issues
[P0] Floating nav pill and cart/currency pill overlap on mobile, blocking header interaction - document.elementFromPoint() at the hamburger's coordinates returns the cart icon instead. Fix: reconcile .nav-inner and .tc so they never share screen space at narrow widths. -> /impeccable adapt

[P1] Catalog filters bury the entire product grid on mobile (~1100px of filter UI before the first product). Fix: collapse into a bottom-sheet "Filters" trigger, grid shown by default. -> /impeccable adapt

[P1] Homepage/catalog show hardcoded review counts (e.g. "214") that contradict the live product page ("Reviews (0)") for the same flagship product. Fix: render homepage Featured/Deals from window.__CATALOG instead of static markup. -> /impeccable harden

[P2] Ember accent used decoratively (5 bullet dots) on the product page feature list, violating DESIGN.md's One Ember Rule. Fix: swap to a neutral marker color. -> /impeccable polish

[P3] 10 CSS transitions animate layout properties (width/margin/max-height) instead of transform, causing layout thrash. Fix: swap to transform/grid-template-rows at the flagged lines. -> /impeccable optimize

## Persona Red Flags
Casey (mobile): can't reliably reach header controls (P0); scrolls past ~1100px of filters before seeing a product.
Jordan (first-timer): clicks a "(214) reviews" card into "Reviews (0)" on the flagship product at the exact moment of purchase decision.
Sam (accessibility-dependent): decorative ember bullets dilute the one color meant to carry meaning; keyboard-focus visibility on stacked/overlapping elements needs separate confirmation.

## Minor Observations
- --fg-3 (#6b7280) on --bg (#15161b) computes to ~3.74:1 contrast, fails WCAG AA 4.5:1, used at several small sizes sitewide.
- Several header touch targets sit just under the 44x44px guideline (38x38 icon buttons, 31px-tall hero pill, 43px-tall Join button).
- Dashboard pre-JS markup hardcodes placeholder identity ("Kaden R.") instead of a skeleton state.
- Disabled OAuth buttons explain themselves via hover-only tooltip, invisible to touch users.

## Questions to Consider
1. Would merging the nav pill and currency/cart pill into one component eliminate the overlap by construction rather than needing a z-index patch?
2. Would pulling homepage Featured/Deals from the live catalog also fix the "every review is exactly 5 stars" pattern that reads as too-perfect?
