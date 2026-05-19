#!/usr/bin/env node
/**
 * wanderpuertorico v5.2 dominant-gate dry-run.
 *
 * Reads tours-data.json, isolates priceConfidence === 'low' tours
 * (expected: 119), fetches each FareHarbor page via Playwright, runs
 * extract_price_v52, and writes a structured pass/fail report. NO
 * writes to tours-data.json — read-only by contract.
 *
 * Flag: --dry-run-only  (required; refuses otherwise)
 *
 * Outputs:
 *   - scripts-staging/v52-wpr-dryrun-raw.json (per-tour records)
 *   - scripts-staging/v52-wpr-dryrun.md (human-readable report)
 */

const fs = require('fs');
const { extract_price_v52 } = require('./extract-price-v5.2');

const TOURS_FILE = 'tours-data.json';
const REPORT_FILE = 'scripts-staging/v52-wpr-dryrun.md';
const RAW_FILE = 'scripts-staging/v52-wpr-dryrun-raw.json';

// Add-on idioms used for the Cat-E sanity check on PASSes.
const ADDON_HINTS = /\b(additional|extra|option|optional|rental|nitrox|upgrade|supplement|add-on|addon|surcharge)\b|\+\$/i;

function ensureFlag() {
  if (!process.argv.includes('--dry-run-only')) {
    console.error('Refusing to run without --dry-run-only flag.');
    process.exit(2);
  }
}

function loadLowTours() {
  const data = JSON.parse(fs.readFileSync(TOURS_FILE, 'utf8'));
  const tours = data.tours || data;
  return tours.filter(t => t.priceConfidence === 'low' && t.bookingLink);
}

async function fetchPageText(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    return text.replace(/\s+/g, ' ');
  } finally {
    await page.close();
  }
}

(async () => {
  ensureFlag();
  const lows = loadLowTours();
  console.log(`wanderpuertorico low-confidence tours: ${lows.length}`);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });

  const records = [];
  for (let i = 0; i < lows.length; i++) {
    const t = lows[i];
    const rec = {
      id: String(t.id),
      name: t.name,
      company: t.company,
      capturedPrice: t.price,
      priceLabel: t.priceLabel,
      bookingLink: t.bookingLink,
    };
    try {
      const pageText = await fetchPageText(ctx, t.bookingLink);
      const result = extract_price_v52(pageText);
      rec.reExtractPrice = result.price;
      rec.reExtractConfidence = result.priceConfidence;
      rec.reExtractLabel = result.priceLabel;
      rec.priceSource = result.priceSource || null;
      rec.gate = result.gateResult || null;

      // Sample excerpts for the report
      const m = pageText.match(/Pricing[\s\S]{0,1500}?(?=Cancellation|Description|What's Included|$)/i);
      rec.pricingExcerpt = (m ? m[0] : pageText.slice(0, 800)).slice(0, 600);
      rec.dollarHits = [...pageText.matchAll(/\$\s*\d+(?:,\d{3})*(?:\.\d{2})?/g)]
        .map(x => x[0]).slice(0, 12);
    } catch (err) {
      rec.error = err.message.slice(0, 200);
      rec.gate = { passed: false, criterionFailed: 'fetch-error' };
    }
    records.push(rec);
    if ((i + 1) % 20 === 0) {
      const so_far = records.reduce((a, r) => {
        const k = r.error ? 'err' : (r.gate && r.gate.passed ? 'pass' : 'fail');
        a[k] = (a[k] || 0) + 1;
        return a;
      }, {});
      console.log(`  [${i + 1}/${lows.length}]`, JSON.stringify(so_far));
    }
  }
  await ctx.close();
  await browser.close();

  fs.writeFileSync(RAW_FILE, JSON.stringify(records, null, 2));
  console.log(`✓ Raw records → ${RAW_FILE}`);

  const pass = records.filter(r => r.gate && r.gate.passed);
  const fail = records.filter(r => !(r.gate && r.gate.passed) && !r.error);
  const errs = records.filter(r => r.error);

  console.log(`\nGate PASS:  ${pass.length}`);
  console.log(`Gate FAIL:  ${fail.length}`);
  console.log(`Errors:     ${errs.length}`);

  // FAIL crit histogram
  const failHist = {};
  for (const r of fail) {
    const k = r.gate ? String(r.gate.criterionFailed) : 'no-gate';
    failHist[k] = (failHist[k] || 0) + 1;
  }

  // Crit-4 disqualifier-token histogram
  const crit4Hist = {};
  for (const r of fail) {
    if (!r.gate || r.gate.criterionFailed != 4) continue;
    const tok = r.gate.disqualifierToken || '(unknown)';
    crit4Hist[tok] = (crit4Hist[tok] || 0) + 1;
  }

  // Cat-E candidate detection on PASSes
  const catECandidates = pass.filter(r => {
    const w = r.gate && r.gate.contextWindow;
    return w && ADDON_HINTS.test(w);
  });

  // 5 stratified samples by captured price (lowest 1, mid 3, highest 1)
  const sortedRecs = [...records].sort((a, b) => (a.capturedPrice || 0) - (b.capturedPrice || 0));
  const stratified = [];
  if (sortedRecs.length > 0) stratified.push(sortedRecs[0]);
  if (sortedRecs.length >= 5) {
    const mid = Math.floor(sortedRecs.length / 2);
    stratified.push(sortedRecs[Math.floor(mid * 0.5)]);
    stratified.push(sortedRecs[mid]);
    stratified.push(sortedRecs[Math.floor(mid * 1.5)]);
  }
  if (sortedRecs.length > 1) stratified.push(sortedRecs[sortedRecs.length - 1]);

  // Build markdown
  const L = [];
  L.push('# wanderpuertorico v5.2 Dominant-Gate Dry-Run');
  L.push('');
  L.push(`**Generated:** ${new Date().toISOString()}`);
  L.push(`**Branch:** \`feat/wpr-v52-dominant-gate\``);
  L.push(`**Mode:** \`--dry-run-only\` (no writes to tours-data.json)`);
  L.push(`**Currency:** USD`);
  L.push('');
  L.push('## 1. Inputs');
  L.push('');
  L.push(`- wanderpuertorico total tours: 303`);
  L.push(`- Tours with \`priceConfidence === 'low'\` evaluated: **${lows.length}**`);
  L.push(`- Extractor: \`scripts-staging/extract-price-v5.2.js\` (ported verbatim from wanderusvi)`);
  L.push(`- Page fetch: Playwright (chromium headless), 1.5 s settle wait`);
  L.push('');
  L.push('## 2. Gate criteria');
  L.push('');
  L.push('1. v5.4 captured a price (`price !== null`)');
  L.push('2. Distinct `$N` values in page text ≤ **2**');
  L.push('3. Captured price is one of those distinct values (literal match)');
  L.push('4. No disqualifier in ±40 char window AND char-immediately-before-`$` is not `+`');
  L.push('   - blocklist: `deposit | fee | surcharge | tax | tip | gratuity | add-on | addon | child | children | kid | kids | junior | senior | discount | additional | extra | option | optional | rental | nitrox | upgrade | supplement`');
  L.push('');
  L.push('## 3. Headline counts');
  L.push('');
  L.push('| Outcome | Count | Disposition |');
  L.push('|---|---:|---|');
  L.push(`| Gate **PASS** (would graduate low → medium) | **${pass.length}** | promote |`);
  L.push(`| Gate **FAIL** (would remain low) | **${fail.length}** | stay low |`);
  L.push(`| Fetch errors | ${errs.length} | stay low |`);
  L.push(`| **Total evaluated** | ${records.length} | |`);
  L.push('');

  L.push('### 3a. FAIL histogram by criterion');
  L.push('');
  L.push('| Criterion | Count |');
  L.push('|---|---:|');
  const labels = {
    '1': '1 — no captured price after re-extract',
    '2': '2 — > 2 distinct $-values in page',
    '3': '3 — captured price not in page text',
    '4': '4 — disqualifier in ±40 char window',
    'fetch-error': 'fetch-error',
    'no-gate': 'no-gate',
  };
  for (const k of Object.keys(failHist).sort()) {
    L.push(`| ${labels[k] || k} | ${failHist[k]} |`);
  }
  L.push('');

  L.push('### 3b. Crit-4 disqualifier-token breakdown');
  L.push('');
  if (Object.keys(crit4Hist).length === 0) {
    L.push('_(no crit-4 fails)_');
  } else {
    L.push('| Token | Count |');
    L.push('|---|---:|');
    for (const k of Object.entries(crit4Hist).sort((a, b) => b[1] - a[1])) {
      L.push(`| \`${k[0]}\` | ${k[1]} |`);
    }
  }
  L.push('');

  L.push('## 4. Cat-E zero-FP sanity check on PASSes');
  L.push('');
  if (catECandidates.length === 0) {
    L.push(`**0 Cat-E candidates** detected among ${pass.length} gate PASSes. Disqualifier blocklist + \`+$\` guard hold clean.`);
  } else {
    L.push(`**⚠ ${catECandidates.length} Cat-E candidate(s)** — gate-PASS tours whose context window contains an add-on idiom that slipped past the disqualifier check:`);
    L.push('');
    for (const r of catECandidates) {
      L.push(`- **${r.id}** (${r.name}) — captured \$${r.capturedPrice}, window: \`${(r.gate.contextWindow||'').slice(0,140).replace(/\|/g,'\\|')}\``);
    }
  }
  L.push('');

  L.push('## 5. Stratified sample verification (5 tours, sorted by captured price)');
  L.push('');
  for (const r of stratified) {
    L.push(`### ${r.id} — ${r.name}`);
    L.push('');
    L.push(`- captured price: **$${r.capturedPrice}**`);
    L.push(`- gate decision: ${r.gate && r.gate.passed ? '**PASS** → would graduate to medium' : `FAIL (crit ${r.gate ? r.gate.criterionFailed : '—'})`}`);
    if (r.gate) {
      if (r.gate.distinctDollarValues) L.push(`- distinct $-values in page: ${JSON.stringify(r.gate.distinctDollarValues)}`);
      if (r.gate.disqualifierToken) L.push(`- disqualifier hit: \`${r.gate.disqualifierToken}\``);
      if (r.gate.contextWindow) {
        L.push(`- ±40 char window:`);
        L.push('');
        L.push('  ```');
        L.push('  ' + (r.gate.contextWindow || '').slice(0, 200));
        L.push('  ```');
      }
    }
    if (r.dollarHits && r.dollarHits.length) L.push(`- all $-hits in page: ${JSON.stringify(r.dollarHits)}`);
    L.push('');
  }

  L.push('## 6. Out of scope for this run');
  L.push('');
  L.push('- No edits to `tours-data.json`.');
  L.push('- No commits, no push, no deploy.');
  L.push('- `--live` mode requires explicit approval. See proven `apply-v52-live.js` pattern in wanderusvi PR #11.');
  L.push('');

  fs.writeFileSync(REPORT_FILE, L.join('\n'));
  console.log(`✓ Report → ${REPORT_FILE}`);
  console.log(`\nDry-run complete. Awaiting --live approval.`);
})().catch(e => { console.error(e); process.exit(1); });
