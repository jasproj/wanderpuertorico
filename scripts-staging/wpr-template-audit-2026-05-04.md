# WanderPuertoRico Template A/B Unification Audit
**Date:** 2026-05-04
**Branch:** `fix/wpr-template-b-unification`
**Status:** Diagnosis only — no fixes applied. Awaiting go-ahead.

---

## TL;DR

Two templates coexist:

- **Template A** (rich): 11 pages. `class="header"` with image logo + `.nav-desktop` + `.mobile-menu-btn` + `.nav-mobile`. Loads `styles.css`. Hero either `.activity-hero` (10) or `.hero` slideshow (1, index only).
- **Template B** (simple): 13 pages. Plain `<header>` with text logo, 3-link `<nav>` (Home/FAQ/Blog), no hamburger, no `.nav-mobile`. Inline `<style>` block, no `styles.css`. Hero `.hero` (simple) or none.

**Real impact, ranked:**
1. **Bug #1 (mobile nav broken on Template B)** — 13 pages on mobile show only the "Home" link; FAQ and Blog are hidden. Same severity as the hamburger bug fixed in PR #20/#21, but on a different surface. ~6 of these 13 are direct destination/landing pages (high-traffic).
2. **Bug #2 (logo inconsistency)** — Template B uses text-only logo `WanderPuertoRico`. Looks unbranded vs the homepage. (`vieques.html` was patched in PR #19 to use the picture+img pattern; the other 12 Template-B pages still have text.)
3. **Hero variants** — three structurally different hero patterns (`.hero` slideshow on index, `.activity-hero` on Template A, `.hero` simple on Template B). PR #19's destination-hero CSS works on both `.activity-hero` and Template-B's `.hero` because the rule was inlined in each page's `<style>`. So PR #19 is safe under both templates today; the variant divergence shows up only when you try to apply *site-wide* hero changes from `styles.css`.

---

## 1. Per-page classification

| Page | Template | Hero | Logo | Hamburger | Loads `styles.css` | Loads `app.js` |
|---|:---:|---|:---:|:---:|:---:|:---:|
| `index.html` | A | `.hero` slideshow (5 slides) | image (webp+png) | ✅ | ✅ | ✅ |
| `el-yunque.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `bio-bay.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `kayaking.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `sailing.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `snorkeling.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `old-san-juan.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ❌ |
| `el-yunque/hiking.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ✅ |
| `culebra/snorkeling.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ✅ |
| `bio-bay/kayaking.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ✅ |
| `vieques/tours.html` | A | `.activity-hero` | image (png) | ✅ | ✅ | ✅ |
| `culebra.html` | **B** | `.hero` (simple) | text only | **❌** | ❌ | ❌ |
| `vieques.html` | **B** | `.hero` (simple) | image (PR #19 fix) | **❌** | ❌ | ❌ |
| `san-juan.html` | **B** | `.hero` (simple) | text only | **❌** | ❌ | ❌ |
| `fajardo.html` | **B** | `.hero` (simple) | text only | **❌** | ❌ | ❌ |
| `faq.html` | **B** | `.hero` (simple) | text only | **❌** | ❌ | ❌ |
| `about.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `puerto-rico-itinerary.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `bio-bay-tours-puerto-rico.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `culebra-snorkeling-tours.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `el-yunque-tours.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `fajardo-water-tours.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `vieques-day-trip.html` | **B** | none | text only | **❌** | ❌ | ❌ |
| `advertise.html` | **B** (hybrid) | none | text only | **❌** | ✅ | ✅ |
| `index_old.html` | legacy | `.hero` (simple) | varies | partial | ❌ | ❌ |

**Counts**
- Template A (working): 11 pages
- Template B (broken-ish): 13 pages
- Mixed/legacy: 1 page (`advertise.html` loads styles.css + app.js but uses Template B header), plus `index_old.html` which should be deleted

---

## 2. Hamburger gap on Template B

**Header markup comparison:**

| | Template A | Template B |
|---|---|---|
| Container | `<header class="header">` | `<header>` (no class) |
| Wrapper | `<div class="header-container">` | `<div class="nav-wrap">` |
| Logo | `<a class="logo"><picture>…<img></picture></a>` (or `<img>+span`) | `<a class="logo">WanderPuertoRico</a>` (text) |
| Desktop nav | `<nav class="nav-desktop">` (4–5 links) | `<nav>` (3 links: Home, FAQ, Blog) |
| Hamburger button | `<button class="mobile-menu-btn">` ✅ | **absent** |
| Mobile nav | `<nav class="nav-mobile">` (mirror of desktop) | **absent** |

**Mobile CSS behavior on Template B** (from each Template-B page's inline `<style>`):

```css
@media (max-width: 600px) {
  header nav a { display: none; }
  header nav a:first-child { display: inline; }
}
```

This hides every link except the first. Result: on mobile, Template B headers show only the **Home** link. FAQ and Blog become unreachable from these 13 pages.

**Was this intentional or oversight?** Almost certainly oversight. The 3-link footprint and "show first link only" rule looks like a placeholder pattern from a quick template generator that nobody came back to fix. The Template B pages were probably scaffolded before Template A's header pattern was finalized.

---

## 3. Hero variants

Three distinct heroes coexist:

### Variant 1 — `index.html` `.hero` slideshow (1 page)
- 5-slide animated `<div class="hero-bg" id="heroBg">` with rotating background-image keyframe animation
- CSS lives in `styles.css` (lines 169–270)
- Uses `images/hero-photo-{1,2,3}.jpg`
- Has `.hero-overlay`, `.hero-content`, `.hero-tagline`, `.hero-logo-pill` decorations

### Variant 2 — Template A `.activity-hero` (10 pages)
- Single static photo via CSS `background-image`
- CSS inlined per page, identical in structure
- After PR #19: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.25)), url('/images/hero-{slug}.jpg')` overlay
- `min-height: 320px` desktop, `130px` mobile
- `padding: 120px 20px 60px` desktop
- H1: 3rem font-size

### Variant 3 — Template B `.hero` (simple, 6 pages: 4 destinations + faq + index_old)
- Single static photo via CSS `background-image`
- CSS inlined per page (in `<style>` block)
- After PR #19: same overlay pattern as Variant 2 — wired only on the 4 destination pages
- `min-height: 320px` desktop, `130px` mobile
- `padding: 80px 20px` desktop
- H1: 2.5rem font-size
- Wrapped in `<div class="container">` (Variant 2 isn't)

**What breaks visually when they coexist?**
Today: nothing. Each variant is scoped to its own page (CSS lives in inline `<style>` per page, or in `styles.css` for the index slideshow). They don't collide because no page loads multiple heroes.

**Where they would break:**
- If anything in the future tries to write a *single* `.hero { … }` rule in `styles.css` and have it apply to every page, it would conflict with Template B's inline `.hero { … }` rule (inline likely wins via specificity tie-breaker on source order).
- Tour-aggregation Template-B pages (`bio-bay-tours-puerto-rico.html`, `culebra-snorkeling-tours.html`, `el-yunque-tours.html`, `fajardo-water-tours.html`, `vieques-day-trip.html`) **have no hero at all**, only the gradient header — visually weak compared to their landing-page counterparts.

**PR #19 compatibility:** ✅ Compatible with both Templates A and B. The 6 hero images shipped in #16/#17/#18 were wired in #19 directly into each page's `<style>` block (Template A `.activity-hero` for el-yunque/bio-bay; Template B `.hero` for culebra/vieques/san-juan/fajardo). Both patterns work today. Unification is not required for the heroes themselves to function.

---

## 4. Unification strategy

### Recommendation: **Standardize on Template A's HEADER. Keep page-specific inline `<style>` for now.**

Rationale:
- Template A's header is already the proven, conversion-friendly pattern (hamburger works after #20/#21).
- The bug Jason cares about is the **broken mobile nav on 13 pages**, not the hero variants. Heroes already work after #19.
- Migrating *all* page-specific CSS into `styles.css` is large surface area with high regression risk; the inline `<style>` blocks contain page-specific tour-card and intro styles that don't all belong in a shared stylesheet.
- The minimum-viable unification is: **swap Template-B's `<header>` markup for Template-A's**, **add `<link rel="stylesheet" href="/styles.css">` to load Template-A's header CSS**, and **add the hamburger handler** (already on these via PR #21 only on blog pages — Template B destination/landing pages still need it inline).

### Concrete plan (only-if-go-ahead)

**Per Template-B page (13 files):**
1. **Add to `<head>`:** `<link rel="stylesheet" href="/styles.css">` (so the new `.header`, `.nav-desktop`, `.nav-mobile`, `.mobile-menu-btn` rules apply)
2. **Replace `<header>` markup** with Template-A's pattern:
   - `<header class="header">` + `<div class="header-container">`
   - `<a class="logo"><img src="puertorico-logo-full.png" alt="Wander Puerto Rico" class="logo-img"></a>` (or the picture/source pattern from index.html)
   - `<nav class="nav-desktop">` with the standard 4-link set: Tours, Locations, FAQs, Blog (and maybe Guides on destination pages)
   - `<button class="mobile-menu-btn">` + `<nav class="nav-mobile">` mirror
3. **Inject hamburger handler before `</body>`** (same snippet as PR #21).
4. **Remove the now-orphaned inline CSS** for the old `<header>` rules — keep all other inline page-specific CSS (`.intro`, `.what-to-know`, `.tour-card`, etc.) untouched.
5. **Drop the `@media (max-width: 600px) { header nav a { display: none; ... } }`** rule from inline CSS — `styles.css` will handle responsive nav.

### Risks & flags

| Risk | Page(s) | Notes |
|---|---|---|
| Inline `<style>` may have rules that conflict with `styles.css` (e.g., `header { background: #0c5d8c; }` overriding `.header` brand styling) | All 13 Template-B pages | Inline rules win by specificity tie-break (later-source-order). Need to remove old `header { … }` rules from inline blocks during the swap, not just add the new `<link>`. |
| Hero variant divergence will widen | All 6 destination pages | Template B's `.hero` rules and Template A's `.activity-hero` rules don't conflict today, but if we eventually want to unify hero markup too, that's a follow-up PR. Out of scope for this one. |
| `vieques.html` already had its logo patched in PR #19 | `vieques.html` | The patched logo will be replaced by the unified header pattern. Same outcome, but worth noting for the diff. |
| `advertise.html` already loads `styles.css` + `app.js` but has Template-B header | `advertise.html` | Adding the `.header` markup will work; the existing inline CSS may have `header { … }` conflicts to clean up. |
| `index_old.html` is legacy | `index_old.html` | Recommend deleting in this PR rather than migrating. Confirm with Jason. |
| Tour-aggregation Template B pages have no hero — won't be improved by header unification | 5 pages | If you want them to gain heroes, that's a separate sourcing exercise (more Pexels images). Not blocking. |

### Estimated complexity

- **Files modified:** ~13 (the Template-B pages) + possibly 1 (`index_old.html` deletion)
- **Lines per file:** ~30–50 changed (header markup swap + style cleanup + handler injection)
- **Style risk:** medium — inline CSS conflicts need a careful audit per page during edit
- **Verification:** mobile-viewport test on each page, plus desktop visual regression spot-check
- **Time:** ~30–45 min for an agent doing 13 files with care

### Out of scope for this PR (recommended follow-ups)

- Hero markup unification (collapse `.hero` slideshow + `.activity-hero` + `.hero` simple into one pattern in `styles.css`)
- Migrating page-specific CSS out of inline `<style>` blocks into `styles.css`
- Adding heroes to the 5 tour-aggregation Template-B pages
- Normalizing the 3 hamburger-handler variants in the codebase (audit recommended after #21)
- Image logo standardization on Template-A (some use `puertorico-logo-full.png`, index uses `images/logo.png` + `images/logo.webp`)

---

## Awaiting go-ahead

If approved, next step is to spawn the unification work on this branch (`fix/wpr-template-b-unification`). I'll do it iteratively: swap header on `culebra.html` first as a canary, verify visually, then propagate to the other 12.
