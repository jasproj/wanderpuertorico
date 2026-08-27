// s53-wpr-schema-gate: dump the unit-evidence vocabulary of the EMITTING
// population so the three-state classifier is built from this repo's own
// data, not a guessed word list.
//
// The emitting population is every row capable of ever backing a rendered
// card ANYWHERE on the site, restricted to rows whose price today's
// generateTourSchema() would actually emit bare:
//   - status !== 'inactive' && !bookingDead        (index.html AND all six
//     activity-loader.js pages gate on exactly this before any card exists)
//   - formatPrice(...) !== 'Price on request'      (tour-render.js's own
//     usability test — the same test generateTourSchema's emitPrice uses)
//   - pk not in DRAW_POOL_EXCLUDED_PKS             (app.js:292-295 — the two
//     rows carry tags:[] and are pinned nowhere, so no page can ever render
//     them as a card; verified against app.js's own source below, not
//     hand-copied)
// usage: node vocab.mjs <tour-render.js> <app.js> <tours-data.json>
import fs from 'fs';
import vm from 'vm';

const [renderPath, appPath, dataPath] = process.argv.slice(2);

const renderSrc = fs.readFileSync(renderPath, 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(renderSrc + '\n;globalThis.__x={formatPrice,priceUnit};', ctx);
const { formatPrice, priceUnit } = ctx.__x;

// Drift guard: DRAW_POOL_EXCLUDED_PKS is a local array inside app.js's
// loadTours(), not an exported symbol — assert the two literal pks this
// script hardcodes are still the ones app.js excludes, rather than silently
// growing stale if app.js's list ever changes.
const appSrc = fs.readFileSync(appPath, 'utf8');
const EXCLUDED = [641082, 447602];
const excludedBlockMatch = appSrc.match(/DRAW_POOL_EXCLUDED_PKS\s*=\s*\[([\s\S]*?)\]/);
if (!excludedBlockMatch) throw new Error('DRAW_POOL_EXCLUDED_PKS not found in app.js — census pool assumption stale');
const foundPks = [...excludedBlockMatch[1].matchAll(/\d+/g)].map(Number);
if (foundPks.length !== EXCLUDED.length || !EXCLUDED.every(pk => foundPks.includes(pk))) {
  throw new Error(`app.js DRAW_POOL_EXCLUDED_PKS is ${JSON.stringify(foundPks)}, script hardcodes ${JSON.stringify(EXCLUDED)} — update this script`);
}

const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const rows = Array.isArray(d) ? d : d.tours;

const pool = rows.filter(t =>
  t.status !== 'inactive' && !t.bookingDead
  && formatPrice(t.price, t.priceConfidence) !== 'Price on request'
  && !EXCLUDED.includes(t.pk)
);
console.log(`pool (emitting population): ${pool.length} of ${rows.length} rows`);

function anchorTier(t) {
  const pb = Array.isArray(t.priceBreakdown) ? t.priceBreakdown : [];
  return pb.find((p) => p.price === t.price) || null;
}

function tally(label, values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  console.log(`\n== ${label} (${m.size} distinct) ==`);
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`${String(n).padStart(5)}  ${k}`));
}

tally('priceUnit (_unknownFields.priceUnit via priceUnit())', pool.map((t) => priceUnit(t) || '<empty>'));
tally('priceLabel', pool.map((t) => (t.priceLabel || '<null>').trim() || '<empty>'));
tally('anchor tier singular', pool.map((t) => {
  const a = anchorTier(t);
  return a ? (a.singular || '<no-singular>').trim() : '<no-anchor-tier>';
}));
