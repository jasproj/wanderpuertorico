# WanderPuertoRico Comprehensive UX/Visual Audit
**Date:** 2026-05-03
**Branch:** `feat/wpr-v52-dominant-gate`
**Mode:** Read-only audit. No files modified.

---

## Executive Summary

Two parallel page templates exist in this repo and most of the visual/UX bugs trace back to that split:

- **Template A — "Rich" template** (modeled on `index.html`): used by `index.html`, `el-yunque.html`, `bio-bay.html`, and all `blog/*.html`. Has `<header class="header">` with logo image, hamburger button, and references shared `styles.css`.
- **Template B — "Simple" template**: used by `vieques.html`, `culebra.html`, `san-juan.html`, `fajardo.html`. Inline `<style>` block, plain `<header>`, text-only logo, no hamburger, gradient-only hero.

Core problems:
1. **The hamburger button has no JS handler anywhere** — it doesn't toggle the menu on the homepage or on any Template-A page.
2. **No destination-specific hero photos exist** for any of the six region pages. Templates use only color gradients.
3. **Vieques (and 3 sister pages) use the wrong template** — that's why the logo is "missing".
4. **Blog hero stretches to 100vh** with no `.hero-blog` modifier, blowing up a 1200×400 source image.
5. **A markdown-injection step ran without a renderer**: 78 blog articles contain literal `**Pro tip:** [anchor](https://amazon.com/dp/B001234567...)` text. Same placeholder ASIN appears across 4 of the 9 sites (289 files, 807 occurrences total).
6. **CTA copy hasn't been normalized to "Check Availability"** in 29 blog files (99 occurrences) and 4 region subpages.

---

## A. Hamburger menu mobile bug

### Root cause
The mobile menu button exists in HTML and CSS, **but no JavaScript handler is wired up to toggle the `.active` class on `.nav-mobile`.**

### Evidence
- `index.html:150-152` — button markup:
  ```html
  <button class="mobile-menu-btn" aria-label="Menu">
      <span></span><span></span><span></span>
  </button>
  ```
- `index.html:154-160` — mobile nav `<nav class="nav-mobile">` (hidden by default).
- `styles.css:128-136` — display rules:
  - `.nav-mobile { display: none; ... }`
  - `.nav-mobile.active { display: flex; }`
- `styles.css:145-148` — `@media (max-width: 768px)` shows the button, hides `nav-desktop`.
- `app.js` (full file): no listener on `.mobile-menu-btn`, no reference to `nav-mobile`, no `classList.toggle('active')` for a menu. Only handlers present are tour filters (`activity-filter`, `sort-filter`, `search-input`) and the sticky CTA bar (`app.js:291-302`, `app.js:305-332`). Confirmed via `grep -nE "mobile-menu-btn|nav-mobile|hamburger|menu-toggle|mobileMenu" app.js` → zero matches.

### Scope
- Same broken hamburger markup is reused (and just as broken) on Template-A pages: `el-yunque.html:334-336`, `bio-bay.html:334-336`, and **every `blog/*.html` file** (e.g. `blog/best-bio-bay-tour-for-first-timers.html:106-108`).
- Template-B pages (`vieques.html`, `culebra.html`, `san-juan.html`, `fajardo.html`) **don't have a hamburger at all** — their inline `<style>` block (e.g. `vieques.html:66-71`) just hides everything except the first nav link below 600px:
  ```css
  @media (max-width: 600px) {
    header nav a { display: none; }
    header nav a:first-child { display: inline; }
  }
  ```
  So those pages also have no working mobile nav, but for a different reason (no menu UI present).

### Fix complexity: **S**
Add a small click handler to `app.js`:
```js
document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
  document.querySelector('.nav-mobile')?.classList.toggle('active');
});
```
This single fix unblocks every Template-A page (homepage + el-yunque + bio-bay + 78 blog pages) because they all already include `app.js` (or equivalent). Template-B pages need the menu UI added separately (counted under section C).

---

## B. Hero image audit on destination pages

| Page | Template | `.hero` element | Background | Hero asset on disk? |
|---|---|---|---|---|
| `culebra.html` | B (simple) | `<section class="hero">` (line 86) | gradient `linear-gradient(135deg, #0c5d8c 0%, #f08020 100%)` (`culebra.html:40`) | None |
| `vieques.html` | B (simple) | `<section class="hero">` (line 86) | gradient `linear-gradient(135deg, #0c5d8c 0%, #f08020 100%)` (`vieques.html:40`) | None |
| `san-juan.html` | B (simple) | `<section class="hero">` (line 86) | gradient (same blue→orange) | None |
| `fajardo.html` | B (simple) | `<section class="hero">` (line 86) | gradient (same blue→orange) | None |
| `el-yunque.html` | A (rich) | `<section class="activity-hero">` (line 347) | gradient `linear-gradient(135deg, #16a34a 0%, #22c55e 100%)` (`el-yunque.html:64-69`) | None |
| `bio-bay.html` | A (rich) | `<section class="activity-hero">` (line 347) | gradient `linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)` (`bio-bay.html:64-69`) | None |

### Root cause
**No destination-specific hero photos exist anywhere in `images/`.**

`images/` directory contains only:
```
bio-bay-vieques.jpg          (used as area-card thumbnail on index)
el-yunque-rainforest.jpg     (used as area-card thumbnail on index)
hero-banner.png / .webp      (logo lockup, not a photo)
hero-photo-1.jpg / -2 / -3   (homepage rotating background, generic)
logo.png / .webp
favicon.png / .ico
footer-badge.png
og-image.jpg
```

So the bug is **not a CSS misreference** — every region page intentionally falls back to a gradient because there are no per-destination hero assets. The Template-A pages use a class called `.activity-hero` with no rule defined in `styles.css` (only inline `<style>`-block rules exist in each page); Template-B pages also have inline gradients.

### Asset gap (Jason action required)
Need 6 hero photos, ~1920×800 minimum, ideally horizontal-landscape:
1. `images/hero-culebra.jpg` — Flamenco Beach / snorkeling
2. `images/hero-vieques.jpg` — Mosquito Bay or wild horses
3. `images/hero-san-juan.jpg` — El Morro / Old San Juan
4. `images/hero-fajardo.jpg` — Marina / Icacos
5. `images/hero-el-yunque.jpg` — La Mina Falls or canopy
6. `images/hero-bio-bay.jpg` — Bioluminescent kayak shot (hard to source — may need stock)

### Fix complexity: **M**
- Asset sourcing dominates. Once photos exist:
  - Template-A: change `.activity-hero { background: linear-gradient(...) }` to `background: url('images/hero-X.jpg') center/cover, linear-gradient(...)` and add an overlay, ~5 min/page.
  - Template-B: same change in their inline `<style>`. ~5 min/page.
- Suggest unifying these 4 Template-B pages onto the rich template at the same time (see section C).

---

## C. Vieques (and 3 sister pages) header logo missing

### Root cause
`vieques.html` is on Template B — a self-contained page with its own inline `<style>` and a plain `<header>` containing only a **text** logo. There is no `<img>` element at all.

### Evidence
- `vieques.html:75-83`:
  ```html
  <header>
    <div class="nav-wrap">
      <a href="/" class="logo">WanderPuertoRico</a>
      <nav>
        <a href="/">Home</a>
        <a href="/faq.html">FAQ</a>
        <a href="/blog/">Blog</a>
      </nav>
    </div>
  </header>
  ```
- `vieques.html:34` defines the styling: `header { background: #0c5d8c; color: white; ... }` and `header .logo { font-weight: 700; font-size: 1.2rem; }` — no logo image rule, no logo image element, full stop.

Compare `index.html:133-142` (Template A — works):
```html
<header class="header">
  <div class="header-container">
    <div class="logo-group">
      <a href="/" class="logo">
        <picture>
          <source srcset="images/logo.webp" type="image/webp">
          <img src="images/logo.png" alt="Wander Puerto Rico" class="logo-img" ...>
        </picture>
      </a>
    </div>
    ...
```

### Scope
Same Template-B problem on:
- `culebra.html:75-83`
- `san-juan.html:75-83`
- `fajardo.html:75-83`

Also affects the dummy region subpages (`vieques/tours.html`, `culebra/snorkeling.html`, `bio-bay/kayaking.html`, `el-yunque/hiking.html`) which are stub Template-B variants.

### Bonus bug — broken logo on blog pages (Template A but wrong path)
- `blog/*.html:97` — every blog page references `<img src="../logo-icon.png" alt="WanderPuertoRico" class="logo-img">` but **no such file exists**. Repo has `puertorico-logo-icon.png` at the project root, not `logo-icon.png`. Confirmed: `ls logo*` returns no matches.
- Same pages, line ~249, reference `<img src="images/footer-badge.png">` — relative to a file in `/blog/` this resolves to `/blog/images/footer-badge.png` which doesn't exist (asset is at `/images/footer-badge.png`). Footer logo is therefore also broken on blog pages.

### Fix complexity
- **S** for blog pages: bulk-rewrite `../logo-icon.png` → `../puertorico-logo-icon.png` (or move/rename the asset) and `images/footer-badge.png` → `../images/footer-badge.png`. ~5 min, sed across `blog/*.html`.
- **M** for Template-B pages: best fix is to port the 4 region pages onto Template A so they share the working `<header class="header">`, hamburger handler, footer, and styles. ~30-45 min if done cleanly, or just inject an `<img src="puertorico-logo-full.png">` into the existing `<a class="logo">` and adjust inline header CSS — quick patch, ~2 min/page.

---

## D. Blog/article hero image sizing bug

### Sample pages inspected
- `blog/best-bio-bay-tour-for-first-timers.html`
- `blog/el-yunque-rainforest-tours.html`
- `blog/san-juan-tours.html`

### Root cause
The blog hero markup uses `<section class="hero hero-blog">` but **no CSS rule for `.hero-blog` exists in `styles.css`** (or anywhere). The element therefore inherits the homepage `.hero` rules:
- `styles.css:152-160` — `.hero { min-height: 100vh; padding: 120px 1.5rem 80px; ... }`
- `styles.css:171-174` — `.hero-bg { position: absolute; inset: 0; }`

Inside `.hero-bg` the blog page puts an inline-styled `<img>`:
```html
<!-- blog/best-bio-bay-tour-for-first-timers.html:127-129 -->
<div class="hero-bg">
  <img src="https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=1200&h=400&fit=crop"
       alt="..." style="width: 100%; height: 100%; object-fit: cover;">
</div>
```

Result: a 1200×400 (3:1) Unsplash source is forced to fill a 100vh-tall absolute container (≈1440×900 on desktop, taller on mobile portrait). With `object-fit: cover` the image is scaled up to cover the larger axis (height), which means the upscaled image is >2700px wide; the browser then crops the left/right sides — exactly the "right side cut off" symptom Jason reported. On mobile portrait the upscale is even more extreme, and the source's 1200px width is well below render width, so the image also looks soft/pixelated.

### Why not just shrink hero?
The hero is sized for the homepage's full-bleed photo carousel (which has 3 actual photos at proper resolution). Blog should use a separate, shorter modifier.

### Scope
All ~88 files in `blog/` use the same `<section class="hero hero-blog">` pattern (sampled three; structure is template-stamped).

### Fix complexity: **S**
Add to `styles.css`:
```css
.hero-blog { min-height: 320px; padding: 80px 1.5rem 40px; }
@media (max-width: 768px) { .hero-blog { min-height: 220px; padding: 70px 1rem 30px; } }
```
Also bump Unsplash query to `?w=1920&h=600&fit=crop` (~10 min sed across blog/*.html) for sharper images. Optional follow-up: download to `images/blog/*.jpg` for performance and to remove dependency on Unsplash CDN.

---

## E. Markdown rendering bug

### Root cause
A content-enrichment step injected literal markdown snippets directly into `<p>` tags in the rendered HTML, **but no markdown-to-HTML conversion was run on those snippets.** The pipeline that did this is not present in the repo — `enrich-tours.js` does not match these strings, and the `_shared/` folder only has `sponsor-slot/`. The injection step appears to have been done by a one-off script (since deleted, or run remotely) that's the same generator used on wanderhawaii, keywestsandbartours, and floridasandbartours.

### Evidence
- `blog/best-bio-bay-tour-for-first-timers.html:149`
  ```html
  <p>**Pro tip:** Bring a [waterproof camera](https://amazon.com/dp/B001234567?tag=wandertrav0c1-20) for the best experience.</p>
  ```
  Renders to user as: `**Pro tip:** Bring a [waterproof camera](https://amazon.com/dp/B001234567?tag=wandertrav0c1-20) for the best experience.`

- Worse — the injection sometimes breaks the surrounding paragraph by inserting in the middle of a sentence. Example, `blog/best-bio-bay-tour-for-first-timers.html:158-160`:
  ```html
  <p>...quieter, more intimate experienc

          <p>**Pro tip:** Bring a [dry bag](https://amazon.com/dp/B001234567?tag=wandertrav0c1-20) for the best experience.</p>es.</p>
  ```
  The word "experiences" is split, and an unclosed `<p>` is followed by a stray `es.</p>`. This produces invalid HTML and visible text fragmentation.

- `blog/fajardo-boat-tours.html:115` shows the same split-mid-line pattern.

### Scope
- **78 blog HTML files** in WPR contain literal markdown injections (per `grep -l "Pro tip:\*\*\|](https://amazon"` — 78 files; the 79th match is a snippet/template file `wanderpr-faq-section.html`).
- **219 individual injection occurrences** in WPR.
- These are the same files counted in section F (1:1 overlap).

### Fix complexity: **M**
Two viable strategies:

1. **Strip the injections entirely** (recommended unless you have real ASINs ready):
   - Regex delete the entire `<p>**Pro tip:** Bring a [...](...) for the best experience.</p>` line per file.
   - Also clean up the orphaned `es.</p>` / `s.</p>` / etc. fragments left behind from mid-paragraph injections.
   - Single sed/Node script over `blog/*.html` ~30 min including verification.

2. **Render the markdown** in place:
   - Convert each `**X**` → `<strong>X</strong>`, `[Y](Z)` → `<a href="Z">Y</a>`.
   - Still leaves the placeholder ASINs (see F) and the broken-sentence injections.
   - Not recommended without real ASINs.

---

## F. Placeholder Amazon ASINs across all sites

### Methodology
`grep -rln -E "B001234567|B00000000|B0TEST|BPLACEHOLDER|BEXAMPLE"` against each site root. (Token `EXAMPLE` was too broad and produced false positives on prose like "for example" — restricted to `BEXAMPLE`.)

### Per-site totals

| Site | Files affected | Occurrences |
|---|---|---|
| `wanderpuertorico` | **79** | **219** |
| `wanderhawaii` | 64 | 185 |
| `keywestsandbartours` | 79 | 219 |
| `floridasandbartours` | 67 | 184 |
| `wanderengland` | 0 | 0 |
| `wanderamsterdam` | 0 | 0 |
| `wandernewzealand` | 0 | 0 |
| `wtpa` (walktheplankadventures) | 0 | 0 |
| `wanderusvi` | 0 | 0 |
| **TOTAL** | **289** | **807** |

All matches are the same string: `B001234567`. No instances of `B00000000`, `B0TEST`, `BPLACEHOLDER`, or `BEXAMPLE` anywhere.

### Sample evidence (file:line)

WPR:
- `blog/boat-tour-vs-kayak-tour-puerto-rico.html:170` — `**Pro tip:** Bring a [dry bag](https://amazon.com/dp/B001234567?tag=wandertrav0c1-20) ...`
- `blog/boat-tour-vs-kayak-tour-puerto-rico.html:177` — same pattern, `[water shoes]`
- `blog/flamenco-beach-culebra-complete-guide.html:72,106,118` — `[beach towel]`, `[sunscreen]`, `[cooler]`
- `blog/best-bio-bay-tour-for-first-timers.html:149,160` — `[waterproof camera]`, `[dry bag]`

WanderHawaii:
- `blog/hawaii-water-safety-what-to-avoid-hazards.html:68,84,121`
- `blog/lanikai-kayaking-mokulua-islands.html:128,137`

KeyWestSandbarTours (uses `?tag=YOUR-TAG-20` placeholder, even less production-ready):
- `blog/key-west-paddleboard-tours.html:107,131,153`
- `blog/snorkeling-vs-scuba-diving-keys.html:132,157`

FloridaSandbarTours:
- `blog/private-charter-vs-group-boat.html:196,258,269`
- `blog/sunset-vs-sunrise-florida-keys.html:131,153`

A complete file list per site is available via:
```
grep -rln -E "B001234567" ~/repos/{wanderpuertorico,wanderhawaii,keywestsandbartours,floridasandbartours}
```
(omitted from this report for length; the four sites collectively contain 289 unique files).

### Risk
Tag `wandertrav0c1-20` looks like an Amazon Associates tag, so if Amazon ever de-listed or changed `B001234567` to map to a real product, every "Pro tip" link in the network would silently send buyers there with the WPR/etc. affiliate tag attached — a compliance/brand risk. **Highest severity in this audit.**

### Fix complexity: **L** (network-wide)
- Per-site, deletion is **S** (script in section E covers it).
- Decision required first: do you have real ASIN/product mappings, or do we just strip the snippets? If stripping, single Node script can handle all 4 sites. If keeping, you need a curated `{topic → ASIN}` map per site/region — that is the real work.

---

## G. CTA stragglers — `Book {X}` patterns vs network "Check Availability" standard

### Methodology
`grep -rE ">Book [A-Z]" --include="*.html"` then exclude `Book Direct` (a "Why book direct?" section heading on `index.html:320`) and `index_old.html` (a deprecated backup file).

### Counts (WPR only, per scope)

- **Total CTA stragglers found:** ~99 occurrences across **29 unique files**.
- Includes both `<a class="book-btn">Book X</a>` links and `<button>Book X</button>` buttons.

### Evidence — top occurrences by file

`blog/san-juan-tours.html` (9 stragglers, all "Book This Tour"):
- L83, L92, L99, L114, L121, L130, L141, L148, L161 — all `>Book This Tour</a>`

`blog/fajardo-boat-tours.html` (8 stragglers):
- L83 `>Book Full Day Tour<`
- L92 `>Book Half Day Tour<`
- L99 `>Book Mini Boat Snorkel<`
- L106 `>Book Morning Snorkeling Tour<`
- L115 `>Book Icacos Tour<`
- L122 `>Book Spider Boat Tour<`
- L143 `>Book Night Snorkeling<`
- L152 `>Book Sunset Boat Tour<`
- L161 `>Book Morning Dive<`

`blog/puerto-rico-snorkeling-tours.html` (7):
- L83 `>Book San Juan Snorkeling<`
- L92 `>Book Guided Snorkel Tour<`
- L99 `>Book Snorkeling Tour<`
- L110 `>Book Snorkeling Lessons<`
- L133 `>Book Icacos Snorkel Tour<`
- L151 `>Book Coral Reef Snorkel<`
- L160 `>Book Night Snorkeling<`

`blog/puerto-rico-bioluminescent-bay-tours.html` (~7):
- L108 `Book Bio Bay Kayak Tour`
- L115 `Book Glowing Bio Bay Adventure`
- L122 `Book Night Kayaking Tour`
- L138 `Book Bio Bay Tour`
- L162 `Book Clear Bottom Kayak Tour`
- L169 `Book Mosquito Bay Tour`

`blog/culebra-island-tours.html` (7):
- L81 `Book Culebra Aquafari`
- L90 `Book Culebra Snorkeling`
- L97 `Book Culebra Powerboat Tour`
- L104 `Book Private Charter`
- L111 `Book Blue Paradise Experience`
- L120 `Book Turtle Snorkel Tour`
- L127 `Book Full Day Adventure`

`blog/puerto-rico-cave-tours.html` (4):
- L135 `Book Surfari`
- L142 `Book Aguadilla Snorkel`
- L149 `Book Discover Scuba`
- L158 `Book Reef Snorkel Adventure`

`blog/puerto-rico-sunset-cruises.html` (5):
- L92 `Book Private Evening Charter`
- L112 `Book Sunset Boat Experience`
- L123 `Book Private VIP Boat Tour`
- L130 `Book Ponce Departure Tour`
- L139 `Book Floating Dinner`

`blog/el-yunque-rainforest-tours.html` (4):
- L85 `Book Adventure Trail`
- L107 `Book Combo Tour`
- L116 `Book Combo Tour`
- L125 `Book Private Adventure`

`blog/10-best-puerto-rico-tours-2026.html` (5 round-up CTAs):
- L138 `Book Sailing Tours →`
- L154 `Book Food Tours →`
- L172 `Book Camuy Tours →`
- L180 `Book Diving Tours →`
- L190 `Book Culebra Tours →`

`blog/top-5-bio-bay-experiences-ranked.html`: L160 `Book Combo Tours →`
`blog/vieques-island-tours.html`: L123 `Book Vieques Tour`
`blog/rincon-surf-tours.html`: L81 `Book Surfing Adventure`
`blog/ponce-day-trips.html`: L129 `Book Chiliboats Adventure`
`blog/puerto-rico-local-food-culinary-tours.html`: L103 `<h3>Book Culinary Tours</h3>` (not a button — just a section heading; can leave or rename for SEO)
`blog/cheapest-kayak-tours-fajardo.html`: L161 `<h3>Book Group Tours</h3>` (heading, not CTA)
`blog/flamenco-beach-vs-playa-sucia.html`: L239 `>Book Culebra Tours</a>` (with onclick tracking)
`blog/culebra-vs-vieques.html`: L238 `>Book Island Tours</a>` (with onclick tracking)
`blog/best-sunset-sailing-san-juan.html`, `blog/family-friendly-snorkeling-culebra.html`, `blog/wanderpr-faq-section.html`, etc. — additional scattered occurrences.

### Region subpage stub buttons
Four standalone "Book {X}" buttons in stub pages that aren't blog content:
- `vieques/tours.html:173` — `<button>Book Vieques Tour</button>`
- `culebra/snorkeling.html:202` — `<button>Book Snorkeling</button>`
- `bio-bay/kayaking.html:134` — `<button>Book Bio Bay Tour</button>`
- `el-yunque/hiking.html:134` — `<button>Book El Yunque</button>`

These buttons appear to do nothing (no `onclick` or `href`).

### Excluded from count (intentional)
- `index.html:320` — `<h3>Book Direct</h3>` (this is the headline of a "Why book with us" feature card, not a CTA).
- `index_old.html:1483` — same heading in an old backup page.
- All `Check Availability` instances are already correct.

### Fix complexity: **S**
Bulk find-replace across `blog/*.html`:
- `>Book This Tour</a>` → `>Check Availability →</a>`
- `>Book {Anything} (Tour|Tours|Adventure|Experience|Snorkel|Charter|...)</a>` → `>Check Availability →</a>`
- Headings (`<h3>Book ...</h3>`) — leave for SEO/accessibility (they're not CTAs).

Single regex pass + manual review of borderline cases (~20 min). Recommend keeping the `→` arrow to match the existing destination tour-card style (e.g. `vieques.html:127`).

---

## Recommended fix order (by user impact)

1. **Hamburger handler** (A) — **S, ~5 min**. Single line of JS unblocks mobile nav across the entire homepage and all 80+ Template-A pages. Highest impact-to-effort.
2. **Blog logo path** (C bonus) — **S, ~5 min**. `../logo-icon.png` is a 404 on every blog page; obvious "broken site" signal to readers.
3. **Blog hero modifier** (D) — **S, ~10 min**. Add `.hero-blog` rules; stops the giant cropped hero on every article page.
4. **CTA normalization** (G) — **S, ~20 min**. Network-consistent CTA copy. Worth doing alongside D since it's the same files.
5. **Strip placeholder ASIN injections** (E + F) — **M, ~30-60 min**. 78 WPR files contain literal markdown that renders as garbage and points to a fake ASIN. **Do this before any new traffic push.** Same script can fan out to wanderhawaii (64 files), keywestsandbartours (79), floridasandbartours (67) — so this is one Node script that fixes 289 files, 807 occurrences network-wide.
6. **Vieques/Culebra/San Juan/Fajardo template fix** (B + C) — **M, ~1-2 hr**. Either:
   (a) Quick patch: insert `<img>` into the existing `<a class="logo">` tag and add a hamburger button matching Template A on these 4 pages.
   (b) Full port: migrate the 4 region pages onto Template A so they share `styles.css`, the (now-fixed) hamburger, and the standard footer.
   Recommend (b) because it removes the two-template fork that's the root cause of half this audit.
7. **Hero photos for region pages** (B) — **M, blocked on assets**. Once Jason supplies 6 destination hero images, dropping them into the (rich-template) `.activity-hero` rules is ~5 min/page.

---

## Asset gaps requiring Jason to provide content

| Asset | Used by | Notes |
|---|---|---|
| `images/hero-culebra.jpg` (~1920×800) | `culebra.html` hero | Beach / snorkeling |
| `images/hero-vieques.jpg` | `vieques.html` hero | Mosquito Bay or wild horses |
| `images/hero-san-juan.jpg` | `san-juan.html` hero | El Morro or Old San Juan streets |
| `images/hero-fajardo.jpg` | `fajardo.html` hero | Marina, Icacos, or catamaran |
| `images/hero-el-yunque.jpg` | `el-yunque.html` hero | La Mina Falls / canopy |
| `images/hero-bio-bay.jpg` | `bio-bay.html` hero | Bioluminescent kayak (hardest to source — likely needs commissioned/licensed shot) |
| **Decision needed** — real Amazon ASIN+tag map | All "Pro tip" injections (or strip them) | If keeping affiliate snippets, need `{product-keyword → real-ASIN}` map per site. If not, the strip script handles it. |

---

## Out-of-scope observations (noted, not actioned)

- **Two parallel page templates** is the single largest source of rework in this codebase. Worth a refactor pass (Template-B → Template-A migration) when bandwidth allows.
- **`index_old.html`** (1900+ lines) is a backup that still ships in the repo and is reachable if it's in the deploy. Recommend deleting or moving to a `_archive/` folder.
- **Untracked dev artifacts in repo root** (per `git status`): `enrich-full.log`, `app.js.pre-usvi-port`, `enrich-tours.js.bak-currency`, `tours-data.json.pre-*`, `tours-data-enriched.json.pre-positive-filter`. These should be `.gitignore`d or deleted before commit.
- `app.js` and the inline-style Template-B pages both load Google Analytics with **two different measurement IDs** (`G-MBNZZ0D7VD` on most pages, `G-PUERTORICO44` on blog pages — see `blog/best-bio-bay-tour-for-first-timers.html:22-28`). One is likely a placeholder. Verify with Jason.
- Hero overlay opacity is `rgba(0,0,0,0.1)` (`styles.css:6, 200-205`) — very weak. If real hero photos go in, text legibility will need a stronger overlay (~0.4-0.5).
