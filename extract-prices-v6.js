#!/usr/bin/env node
/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ⛔ ABANDONED DEAD-END — DO NOT USE. Kept for documentation only.          │
 * │  Use extract-prices-v7-api.js instead (FareHarbor embed price API).        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS APPROACH FAILED (DOM scraping of the FH public widget page):
 *
 * v6 scrapes the rendered FareHarbor widget DOM for a price. A go/no-go spot
 * check (2026-05-28) found it grabbed the WRONG element on 9 of 9 tours — an
 * unacceptable rate under the zero-Cat-E rule (a wrong price shown is worse
 * than no price). Root causes, none of which DOM scraping can distinguish:
 *
 *   1. DEAD LISTINGS return HTTP 200 with a "Not found" body AND a stale
 *      `.item-price` badge still in the DOM → v6 scraped e.g. "$1,999" off a
 *      dead page.
 *   2. NO-AVAILABILITY items (the common case for the null-price backlog)
 *      render a cross-sell GRID of the operator's OTHER tours
 *      (`.flow-node-tile__price` = "From $X – Y") → v6 took the carousel's
 *      cheapest tile as if it were this item's price (e.g. $169 on a private
 *      charter; $60 on a $247 tour).
 *   3. Items with multiple on-page prices ($375/$399/$425/$750) gave v6 no
 *      canonical value to choose.
 *
 * WHY THE API SUCCEEDED (extract-prices-v7-api.js):
 *
 * FareHarbor's own widget calls a public JSON endpoint,
 * `/api/embed/{shortname}/price-preview/per-item/v2/?item_pks={pk}&include_breakdown=yes`,
 * which returns the canonical per-customer-type price in cents with explicit
 * currency. Crucially it returns an EMPTY `items[]` for dead/no-availability
 * tours — exactly the cases v6 false-positived on — so "no item → leave price
 * null" is structural, not a heuristic. No browser, no LLM, ~100ms/request.
 * See extract-prices-v7-api.js for the canonical implementation.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Original v6 description follows (historical):
 *
 * extract-prices-v6.js
 *
 * Backfill `price`, `currency`, `priceLabel` on Hermes thin-extract tours
 * by scraping the FareHarbor public widget page with Playwright.
 *
 * Zero-FP policy: a wrong price displayed is worse than no price. When
 * extraction is uncertain, leaves price=null. See classifyConfidence().
 *
 * Usage:
 *   node extract-prices-v6.js <path-to-tours-data.json> [--limit N] [--dry-run]
 *
 * Targets: tours where price == null AND bookingUrl contains fareharbor.com.
 *
 * Writes back in place. Checkpoint file: <input>.price-checkpoint.json — distinct
 * from the image script's .checkpoint.json so the two can coexist.
 *
 * Predecessor: per-site extract-price-v5.x scripts (text-regex based, kept for
 * reference). v6 is the unified post-Hermes successor and operates on the
 * rendered DOM via Playwright selectors.
 */

const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const INPUT_FILE = args.find(a => !a.startsWith('--'));
if (!INPUT_FILE) {
  console.error('Usage: node extract-prices-v6.js <path-to-tours-data.json> [--limit N] [--dry-run]');
  process.exit(1);
}
const LIMIT = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;
const DRY_RUN = args.includes('--dry-run');
const CHECKPOINT_FILE = INPUT_FILE + '.price-checkpoint.json';

const RATE_LIMIT_MS = 2500;
const JITTER_MIN_MS = 200;
const JITTER_MAX_MS = 500;
const NAV_TIMEOUT_MS = 20000;
const PRICE_WAIT_MS = 12000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = () => JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);

// Site-level expected currency, used as the default when symbol detection
// is ambiguous. Inferred from the input file path. The "From {SYMBOL}X"
// the page actually shows still wins if it parses cleanly.
function inferSiteCurrency(inputPath) {
  const p = inputPath.toLowerCase();
  if (p.includes('wandernewzealand')) return 'NZD';
  if (p.includes('wanderamsterdam')) return 'EUR';
  if (p.includes('wanderengland')) return 'GBP';
  // wanderhawaii, wanderpuertorico, wanderusvi → USD
  return 'USD';
}

// Symbol → currency. NZ$ must be checked before $ so it wins.
const CURRENCY_SYMBOLS = [
  { symbol: 'NZ$',  currency: 'NZD' },
  { symbol: 'US$',  currency: 'USD' },
  { symbol: 'CA$',  currency: 'CAD' },
  { symbol: 'AU$',  currency: 'AUD' },
  { symbol: '€',    currency: 'EUR' },
  { symbol: '£',    currency: 'GBP' },
  { symbol: '$',    currency: 'USD' },
];

// Parse FH bookingUrl → { shortname, pk } | null
// Supports both forms:
//   https://fareharbor.com/{shortname}/items/{pk}/book/?...
//   https://fareharbor.com/embeds/book/{shortname}/items/{pk}/?...
function parseFhUrl(bookingUrl) {
  if (!bookingUrl || !bookingUrl.includes('fareharbor.com')) return null;
  const m = bookingUrl.match(/fareharbor\.com\/(?:embeds\/book\/)?([^/]+)\/items\/(\d+)/);
  if (!m) return null;
  const [, shortname, pk] = m;
  if (shortname === 'embeds' || shortname === 'items') return null;
  return { shortname, pk };
}

function publicWidgetUrl({ shortname, pk }) {
  return `https://fareharbor.com/${shortname}/items/${pk}/`;
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    return new Set(data.processedPks || []);
  } catch (e) {
    console.warn(`  ⚠ checkpoint unreadable, ignoring: ${e.message}`);
    return new Set();
  }
}

function saveCheckpoint(processedPks) {
  if (DRY_RUN) return;
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify({ processedPks: [...processedPks], updatedAt: new Date().toISOString() }, null, 2)
  );
}

function writeBack(tours, originalShape) {
  if (DRY_RUN) return;
  const out = originalShape.isArray ? tours : { ...originalShape.wrapper, tours };
  fs.writeFileSync(INPUT_FILE, JSON.stringify(out, null, 2));
}

// Convert a "$1,299" / "€39,04" / "1299.00" style string → integer.
// European comma-decimals ("39,04") are truncated to 39 (matches v5.4
// behavior and how the rest of the network stores prices).
function parsePriceString(s) {
  if (!s) return null;
  const cleaned = String(s).trim();
  // Find currency symbol (longest match first via CURRENCY_SYMBOLS order)
  let currency = null;
  let priceText = cleaned;
  for (const { symbol, currency: cur } of CURRENCY_SYMBOLS) {
    const idx = cleaned.indexOf(symbol);
    if (idx !== -1) {
      currency = cur;
      priceText = cleaned.slice(idx + symbol.length);
      break;
    }
  }
  // Extract the first number — handles "1,299.00", "39,04", "79", "1,234,567"
  const m = priceText.match(/(\d{1,3}(?:[,. \s]\d{3})*|\d+)(?:[.,]\d{1,2})?/);
  if (!m) return null;
  // Strip thousands separators (comma, dot, nbsp, space) — keep the integer part.
  // The cents portion was matched non-capturing; we ignore it.
  const intPart = m[1].replace(/[,. \s]/g, '');
  const n = parseInt(intPart, 10);
  if (!Number.isFinite(n)) return null;
  return { value: n, currency };
}

// In-browser helper executed via page.evaluate. Returns raw candidate
// strings from each of the 4 selector families; classification happens
// in Node. Keeping the in-page code small and selector-only makes it
// easier to extend without redeploying logic via page.evaluate.
async function collectCandidates(page) {
  return await page.evaluate(() => {
    const out = { A: [], B: [], C: [], D: [], pageTextSample: '' };

    // Helper: text content of an element, trimmed and whitespace-collapsed.
    const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();

    // Pattern A — calendar day price tooltip / cell
    document.querySelectorAll(
      '[data-test="day-price"], .calendar-day-price, .day-price, .calendar-cell .price, td.fh-calendar-day .price'
    ).forEach(el => {
      const t = txt(el);
      if (t) out.A.push(t);
    });

    // Pattern B — item summary "From $X" / starting price block
    document.querySelectorAll(
      '.item-summary-price, .starting-price, .item-price, [data-test="item-price"], [data-test="starting-price"]'
    ).forEach(el => {
      const t = txt(el);
      if (t) out.B.push(t);
    });
    // Broader B fallback: any element whose class name contains "price"
    // and whose text contains a currency symbol followed by digits.
    document.querySelectorAll('[class*="price" i]').forEach(el => {
      const t = txt(el);
      if (!t || t.length > 80) return;
      if (/(?:NZ\$|US\$|CA\$|AU\$|\$|€|£)\s*\d/.test(t)) {
        out.B.push(t);
      }
    });

    // Pattern C — customer-type-rate (booking flow)
    document.querySelectorAll(
      '[data-test="customer-type-rate"], .customer-type-rate, .customer-rate-selector .rate, .customer-type .price'
    ).forEach(el => {
      const t = txt(el);
      if (t) out.C.push(t);
    });

    // Pattern D — meta product price
    const meta = document.querySelector('meta[property="product:price:amount"]');
    if (meta) out.D.push(meta.getAttribute('content') || '');
    const metaCurrency = document.querySelector('meta[property="product:price:currency"]');
    if (metaCurrency) out.D.push(metaCurrency.getAttribute('content') || '');

    // Sample of page text for debugging when zero patterns fire.
    out.pageTextSample = (document.body && document.body.innerText || '').slice(0, 400);

    return out;
  });
}

// Find adjacent text that hints at a per-unit label.
async function detectPriceLabel(page) {
  return await page.evaluate(() => {
    const body = (document.body && document.body.innerText || '').toLowerCase();
    if (/\bper\s+adult\b/.test(body)) return 'per adult';
    if (/\bper\s+person\b/.test(body)) return 'per person';
    if (/\bper\s+guest\b/.test(body)) return 'per guest';
    if (/\bper\s+group\b/.test(body)) return 'per group';
    if (/\bper\s+vehicle\b/.test(body)) return 'per vehicle';
    if (/\bper\s+vessel\b/.test(body)) return 'per vessel';
    if (/\bper\s+charter\b/.test(body)) return 'per charter';
    if (/\bper\s+boat\b/.test(body)) return 'per boat';
    return null;
  });
}

// Reduce raw candidate strings to { value, currency } parsed prices, with
// site-level currency as the fallback when the page string had no symbol
// (e.g. Pattern D's "29.99" with separate currency meta).
function parseCandidates(rawByPattern, siteCurrency) {
  const out = { A: [], B: [], C: [], D: [] };
  for (const k of ['A', 'B', 'C', 'D']) {
    const seen = new Set();
    for (const raw of (rawByPattern[k] || [])) {
      const parsed = parsePriceString(raw);
      if (!parsed) continue;
      const value = parsed.value;
      // Sanity floor/ceiling: anything outside this range is noise (cents
      // displays, group sizes, year numbers, capacity).
      if (value < 5 || value > 99999) continue;
      const currency = parsed.currency || siteCurrency;
      const key = `${value}|${currency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out[k].push({ value, currency, raw });
    }
  }
  return out;
}

// Pick the representative price for one pattern (lowest plausible value).
// FH calendars often list multiple day prices; the "from" price is the
// minimum across days. For other patterns the minimum is also the safest
// public-facing "starting at" figure.
function patternRepresentative(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => (a.value <= b.value ? a : b));
}

// Confidence rules (zero-FP policy):
//   high     — ≥2 patterns agree on the same price (within 1% slop)
//   medium   — only one pattern fires AND it is A or B
//   low      — only one pattern fires AND it is C or D (manual review)
//   conflict — multiple patterns fire but spread > 20% (suspect)
//   none     — no patterns fire
//
// Returns { status, price?, currency?, candidates }. When status is
// "low" or "conflict" the caller MUST NOT write price.
function classifyConfidence(parsed) {
  const reps = {
    A: patternRepresentative(parsed.A),
    B: patternRepresentative(parsed.B),
    C: patternRepresentative(parsed.C),
    D: patternRepresentative(parsed.D),
  };
  const firing = Object.entries(reps).filter(([, v]) => v != null);

  // Flatten all candidates for the "low"/"conflict" review payload.
  const allCandidates = [];
  for (const k of ['A', 'B', 'C', 'D']) {
    for (const c of parsed[k]) allCandidates.push({ pattern: k, value: c.value, currency: c.currency, raw: c.raw });
  }

  if (firing.length === 0) {
    return { status: 'none', candidates: allCandidates };
  }

  if (firing.length === 1) {
    const [pat, rep] = firing[0];
    if (pat === 'A' || pat === 'B') {
      return { status: 'medium', price: rep.value, currency: rep.currency, candidates: allCandidates };
    }
    // Only C or D → low confidence, do not write
    return { status: 'low', candidates: allCandidates };
  }

  // ≥2 patterns fire. Check spread.
  const values = firing.map(([, v]) => v.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Use lo as denominator — a wild high outlier should still flag conflict.
  const spread = (hi - lo) / lo;

  if (spread > 0.20) {
    return { status: 'conflict', candidates: allCandidates };
  }

  // Agreement (≤20% spread) — count distinct values that are equal-ish.
  // High confidence requires at least 2 patterns within 1% of each other.
  // Pick the modal-ish value (lowest of the cluster) as the chosen price.
  const tightCluster = values.filter(v => Math.abs(v - lo) / lo <= 0.01);
  if (tightCluster.length >= 2) {
    // Currency: prefer A's currency, then B, then C, then D
    const repForCurrency = reps.A || reps.B || reps.C || reps.D;
    return {
      status: 'high',
      price: lo,
      currency: repForCurrency.currency,
      candidates: allCandidates,
    };
  }

  // Patterns fire but no two are within 1% — treat as medium (single
  // representative price) using the lowest plausible value. Only allow
  // when at least one of A/B is among the firing set; otherwise low.
  if (reps.A || reps.B) {
    const repForCurrency = reps.A || reps.B;
    return {
      status: 'medium',
      price: lo,
      currency: repForCurrency.currency,
      candidates: allCandidates,
    };
  }
  return { status: 'low', candidates: allCandidates };
}

async function extractPriceFromPage(page, widgetUrl, siteCurrency) {
  const response = await page.goto(widgetUrl, {
    timeout: NAV_TIMEOUT_MS,
    waitUntil: 'domcontentloaded'
  });

  if (response && (response.status() === 404 || response.status() === 410)) {
    return { status: 'dead_url' };
  }

  // Wait for any of the price-bearing selector families to render. If
  // none appear in time, fall through — collectCandidates can still pick
  // up Pattern D (meta tag) and broad B (class*=price) from the static HTML.
  await page.waitForSelector(
    '[data-test="day-price"], .calendar-day-price, .item-summary-price, .starting-price, [class*="price" i], [data-test="customer-type-rate"], meta[property="product:price:amount"]',
    { timeout: PRICE_WAIT_MS }
  ).catch(() => {});

  // Short settle for Angular interpolation to finalize.
  await sleep(500);

  const raw = await collectCandidates(page);
  const parsed = parseCandidates(raw, siteCurrency);
  const verdict = classifyConfidence(parsed);
  const priceLabel = await detectPriceLabel(page).catch(() => null);

  return {
    status: verdict.status,
    price: verdict.price ?? null,
    currency: verdict.currency ?? null,
    priceLabel,
    candidates: verdict.candidates,
    raw,
  };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const siteCurrency = inferSiteCurrency(INPUT_FILE);
  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const isArray = Array.isArray(raw);
  const tours = isArray ? raw : (raw.tours || []);
  const originalShape = { isArray, wrapper: isArray ? null : raw };

  const candidates = tours.filter(t => {
    if (t.price != null) return false;
    return parseFhUrl(t.bookingUrl) != null;
  });

  const processed = loadCheckpoint();
  const targets = candidates
    .filter(t => !processed.has(t.pk))
    .slice(0, LIMIT);

  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Site currency (default): ${siteCurrency}`);
  console.log(`Total tours: ${tours.length}`);
  console.log(`Candidates (price==null + FH bookingUrl): ${candidates.length}`);
  console.log(`Already processed (from checkpoint): ${processed.size}`);
  console.log(`To process this run: ${targets.length}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT}`);
  console.log('');

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });

  const stats = { processed: 0, high: 0, medium: 0, low: 0, conflict: 0, none: 0, dead_url: 0, timeout: 0, error: 0 };
  const highSamples = [];
  const lowOrConflictSamples = [];

  const startedAt = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const tour = targets[i];
    const parsedUrl = parseFhUrl(tour.bookingUrl);
    const widgetUrl = publicWidgetUrl(parsedUrl);
    const ts = new Date().toISOString();

    let result;
    let page;
    try {
      page = await context.newPage();
      result = await extractPriceFromPage(page, widgetUrl, siteCurrency);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (/Timeout/i.test(msg)) {
        result = { status: 'timeout' };
      } else {
        result = { status: 'error', errorMessage: msg.slice(0, 200) };
      }
    } finally {
      if (page) await page.close().catch(() => {});
    }

    // Provenance always written
    tour.priceEnrichmentSource = 'extract-prices-v6';
    tour.priceEnrichmentAt = ts;
    tour.priceEnrichmentStatus = result.status;

    // Apply price / currency / label per zero-FP policy
    if (result.status === 'high' || result.status === 'medium') {
      tour.price = result.price;
      tour.priceConfidence = result.status;
      if (result.currency) tour.currency = result.currency;
      if (result.priceLabel) tour.priceLabel = result.priceLabel;
      else if (!tour.priceLabel) tour.priceLabel = 'per adult';
      stats[result.status]++;
      if (highSamples.length < 10 && result.status === 'high') {
        highSamples.push({ pk: tour.pk, name: tour.name, price: result.price, currency: result.currency });
      }
    } else if (result.status === 'low' || result.status === 'conflict') {
      // DO NOT write price. Stash candidates for human review.
      tour.priceConfidence = result.status;
      tour.priceCandidates = (result.candidates || []).map(c => ({ pattern: c.pattern, value: c.value, currency: c.currency }));
      stats[result.status]++;
      if (lowOrConflictSamples.length < 10) {
        lowOrConflictSamples.push({ pk: tour.pk, name: tour.name, candidates: tour.priceCandidates });
      }
    } else if (result.status === 'none') {
      stats.none++;
    } else if (result.status === 'dead_url') {
      stats.dead_url++;
    } else if (result.status === 'timeout') {
      stats.timeout++;
    } else {
      stats.error++;
      if (result.errorMessage) tour.priceEnrichmentError = result.errorMessage;
    }

    stats.processed++;
    processed.add(tour.pk);

    if (DRY_RUN) {
      const priceStr = result.price != null ? `${result.currency || ''}${result.price}` : '—';
      const candCount = (result.candidates || []).length;
      console.log(`  [${i + 1}/${targets.length}] pk=${tour.pk} ${result.status} price=${priceStr} label=${result.priceLabel || '—'} candidates=${candCount}`);
      if (result.status === 'none' && result.raw) {
        const sample = (result.raw.pageTextSample || '').slice(0, 120).replace(/\n/g, ' ');
        console.log(`        page-text-sample: "${sample}…"`);
      }
    } else if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(`  [${i + 1}/${targets.length}] hi:${stats.high} med:${stats.medium} lo:${stats.low} cfl:${stats.conflict} none:${stats.none} dead:${stats.dead_url} to:${stats.timeout} err:${stats.error}`);
      writeBack(tours, originalShape);
      saveCheckpoint(processed);
    }

    if (i < targets.length - 1) {
      await sleep(RATE_LIMIT_MS + jitter());
    }
  }

  await browser.close();

  if (!DRY_RUN) {
    writeBack(tours, originalShape);
    saveCheckpoint(processed);
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('✓ Price enrichment run complete');
  console.log(`  processed: ${stats.processed}`);
  console.log(`  high:      ${stats.high}`);
  console.log(`  medium:    ${stats.medium}`);
  console.log(`  low:       ${stats.low}      (price NOT written — review priceCandidates)`);
  console.log(`  conflict:  ${stats.conflict} (price NOT written — review priceCandidates)`);
  console.log(`  none:      ${stats.none}`);
  console.log(`  dead_url:  ${stats.dead_url}`);
  console.log(`  timeout:   ${stats.timeout}`);
  console.log(`  error:     ${stats.error}`);
  console.log(`  elapsed:   ${elapsedSec}s`);
  if (DRY_RUN) console.log('  (dry run — no file writes performed)');

  if (highSamples.length) {
    console.log('');
    console.log('Sample of HIGH-confidence extractions (spot-check candidates):');
    for (const s of highSamples) console.log(`  pk=${s.pk} ${s.currency}${s.price}  ${s.name}`);
  }
  if (lowOrConflictSamples.length) {
    console.log('');
    console.log('Sample of LOW/CONFLICT extractions (manual review):');
    for (const s of lowOrConflictSamples) {
      console.log(`  pk=${s.pk} ${s.name}`);
      for (const c of s.candidates) console.log(`     ${c.pattern}: ${c.currency || ''}${c.value}`);
    }
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
