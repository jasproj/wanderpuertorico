# wanderpuertorico v5.2 Dominant-Gate Dry-Run

**Generated:** 2026-05-03T22:26:17.302Z
**Branch:** `feat/wpr-v52-dominant-gate`
**Mode:** `--dry-run-only` (no writes to tours-data.json)
**Currency:** USD

## 1. Inputs

- wanderpuertorico total tours: 303
- Tours with `priceConfidence === 'low'` evaluated: **119**
- Extractor: `scripts-staging/extract-price-v5.2.js` (ported verbatim from wanderusvi)
- Page fetch: Playwright (chromium headless), 1.5 s settle wait

## 2. Gate criteria

1. v5.4 captured a price (`price !== null`)
2. Distinct `$N` values in page text ≤ **2**
3. Captured price is one of those distinct values (literal match)
4. No disqualifier in ±40 char window AND char-immediately-before-`$` is not `+`
   - blocklist: `deposit | fee | surcharge | tax | tip | gratuity | add-on | addon | child | children | kid | kids | junior | senior | discount | additional | extra | option | optional | rental | nitrox | upgrade | supplement`

## 3. Headline counts

| Outcome | Count | Disposition |
|---|---:|---|
| Gate **PASS** (would graduate low → medium) | **62** | promote |
| Gate **FAIL** (would remain low) | **57** | stay low |
| Fetch errors | 0 | stay low |
| **Total evaluated** | 119 | |

### 3a. FAIL histogram by criterion

| Criterion | Count |
|---|---:|
| 2 — > 2 distinct $-values in page | 20 |
| 4 — disqualifier in ±40 char window | 9 |
| no-gate | 28 |

### 3b. Crit-4 disqualifier-token breakdown

| Token | Count |
|---|---:|
| `rental` | 4 |
| `children` | 2 |
| `extra` | 1 |
| `additional` | 1 |
| `add-on` | 1 |

## 4. Cat-E zero-FP sanity check on PASSes

**0 Cat-E candidates** detected among 62 gate PASSes. Disqualifier blocklist + `+$` guard hold clean.

## 5. Stratified sample verification (5 tours, sorted by captured price)

### pr-511528 — Beach Lounge Chair Rental

- captured price: **$15**
- gate decision: FAIL (crit 2)
- distinct $-values in page: [5,10,12,15,20,25,30,35]
- all $-hits in page: ["$5","$10","$15","$20","$25","$30","$35","$20","$12"]

### pr-640481 — Underwater Magic: Aguadilla Snorkel Adventure

- captured price: **$60**
- gate decision: **PASS** → would graduate to medium
- distinct $-values in page: [60]
- ±40 char window:

  ```
  ach| Rincon 4.7 stars 92 Google reviews $60 Snorkelers Prices for Tuesday, May 5, 2
  ```
- all $-hits in page: ["$60"]

### pr-567604 — Flyboard for 2 People

- captured price: **$120**
- gate decision: **PASS** → would graduate to medium
- distinct $-values in page: [120]
- ±40 char window:

  ```
  yboarding! 4.6 stars 205 Google reviews $120 Flyboard Sessions Prices for Monday, Ma
  ```
- all $-hits in page: ["$120"]

### pr-678954 — NIGHT DIVE

- captured price: **$250**
- gate decision: **PASS** → would graduate to medium
- distinct $-values in page: [250]
- ±40 char window:

  ```
   date to browse availability NIGHT DIVE $250 People INCLUDES EQUIPMENT - You need to
  ```
- all $-hits in page: ["$250"]

### pr-34811 — Private Icacos Luxury Sailing Catamaran Beach Day

- captured price: **$7600**
- gate decision: FAIL (crit —)

## 6. Out of scope for this run

- No edits to `tours-data.json`.
- No commits, no push, no deploy.
- `--live` mode requires explicit approval. See proven `apply-v52-live.js` pattern in wanderusvi PR #11.
