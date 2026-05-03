# wanderpuertorico v5.2 Dry-Run Report — null-price tour re-extraction

**Generated:** 2026-05-03T20:33:44.010Z
**Branch:** `feat/pr-v52-price-extraction`
**Mode:** `--dry-run-only` (no writes to tours-data.json)

## 1. Inputs

- wanderpuertorico total tours: 303
- Tours with `price: null` evaluated: **102**
- Extractor: v5.4 baseline + v5.2 dominant-price gate (ported verbatim from wanderusvi)
- Page fetch: Playwright (chromium headless), 1.5 s settle wait

## 2. Result distribution

| Outcome | Count | Disposition |
|---|---:|---|
| **high** (v5.4 Method 1/2 — adult/per-person anchor) | 0 | "From $X" if applied |
| **medium** (v5.4 native — Method 3/4/6) | 0 | "From $X" if applied |
| **medium** (v5.2 dominant-price gate) | 0 | "From $X" if applied |
| **low** (Method 5 unanchored, gate FAILed) | 0 | stays "Check availability" |
| **no-price** (extractor returned null) | 102 | stays "Check availability" |
| **error** (fetch/parse) | 0 | stays "Check availability" |
| **Total** | 102 | |

**Net effect if applied --live:** 0 tours flip from "Check availability" → "From $X" (0.0% of the 102). 102 stay hidden.

## 3. Cat-E candidate sanity check

**0 Cat-E candidates** detected among gate PASSes. Disqualifier blocklist (`additional, extra, option, optional, rental, nitrox, upgrade, supplement, add-on, addon, surcharge` + `+$` literal) appears to be holding.

## 4. Sample 10 promoted tours

## 5. Sample 5 stays-hidden tours

### pr-448580 — Public Vieques Powerboat Snorkeling with Turtles and Beach Tour

- outcome: no-price

### pr-34807 — Public Culebra Power Boat Snorkeling &  Beach Tour

- outcome: no-price

### pr-35078 — Private Culebra Powerboat Snorkel & Beach Tour

- outcome: no-price

### pr-11821 — Fajardo Bio Bay Kayak Tour

- outcome: no-price
- all $-hits: ["$59"]

### pr-180567 — Jet Snorkel Tour - San Juan

- outcome: no-price

## 6. Out of scope for this run

- No edits to `tours-data.json`.
- No commits, no push, no deploy.
- `--live` mode not implemented yet — adopt USVI's `apply-v52-live.js` pattern when ready.

---

## 7. STATUS: DEFERRED (2026-05-03)

**This dry-run produced 0 / 102 viable promotions. No --live run is being scheduled. No PR is being opened against `wanderpuertorico/main`.**

### Why deferred

Decomposing the 102 results:

| Bucket | Count | % |
|---|---:|---:|
| Page contains no `$N` markup at all | **80** | 78% |
| Page has `$N` markup but extractor returned null | **22** | 22% |
| Total | 102 | 100% |

The **80 / 78%** with no `$N` are **booking-flow-gated**: many FareHarbor pages for these PR operators (sailgetaway and similar) display only a "Pricing | Additional information | FAQs" section header, or render messages like "Sorry, there is no online availability for May 2026" with the price hidden behind a date-selection step in the booking calendar. Re-running the same extractor against these pages will continue to return null indefinitely; this is not a v5.x bug, it is the operator's HTML.

The remaining **22 / 22%** with `$N` markup are technically recoverable by extractor enhancement, not by another --live attempt. Sampled cases (cleaned for clarity):

| ID | $-hits | Name | Why v5.4 missed it |
|---|---|---|---|
| `pr-11821` | `$59` | Fajardo Bio Bay Kayak Tour | Single price, but located outside the `Pricing` section that v5.4 Method 5 scans |
| `pr-19384` | `$97` | Afternoon Snorkeling Adventure | Same — `$97` is in body text, not in pricing section |
| `pr-9567` | `$169` | PADI Scuba Refresher | Same |
| `pr-286798` | `$3.00` | La Parguera Adventure | Below v5.4's `$15` minimum threshold |
| `pr-290742` | `$50` | Reservaciones Cumpleaños 1:00pm | Spanish-language non-standard FareHarbor template |

### Recoverable in future v5.5 extractor work

A targeted v5.5 enhancement could pick these up by:

1. **Broadening Method 5's section scope** — fall back from the `Pricing[\s\S]{0,2000}?(?=Cancellation|Description|What's Included)` regex to the full body text when no in-section candidates are found, gated by the same disqualifier blocklist + a tighter "must be within 60 chars of duration / per-person / hour / day token" rule to control FP risk.
2. **Adding a Spanish-language path** — the Spanish-template tours likely have predictable markers (`Reservaciones`, `Aventura`, etc.) that could be detected and routed to a parallel extractor with Spanish-aware keywords.
3. **Lowering the `$15` minimum threshold for explicit per-person tours** — `$3.00` looks like a junk hit, but a `$5` or `$10` per-person fee on a kayak rental is plausible.

Projected post-v5.5 ceiling on PR: **~22 / 102 (~22%)** — still much lower than the rest of the network because 78% of these pages are genuinely behind the booking flow.

### What was committed to this branch

The dry-run scripts and report on branch `feat/pr-v52-price-extraction`:

- `scripts-staging/extract-price-v5.js` — v5.4 baseline (byte-identical to network)
- `scripts-staging/extract-price-v5.2.js` — v5.2 dominant-price gate (byte-identical to network)
- `scripts-staging/run-v52-pr-dryrun.js` — dry-run runner
- `scripts-staging/v52-pr-dryrun-raw.json` — 102 per-tour records (preserved for future v5.5 evaluation)
- `scripts-staging/v52-pr-dryrun.md` — this report

**No `tours-data.json` mutations. No `--live` mode authored. No PR opened.** When v5.5 ships, re-run the dry-run on the same 102 IDs and compare deltas.
