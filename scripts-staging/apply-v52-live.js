#!/usr/bin/env node
/**
 * v5.2 dominant-gate live applicator (wanderpuertorico).
 *
 * Reads scripts-staging/v52-wpr-dryrun-raw.json (the validated gate
 * decisions from the most recent dry-run) and applies them to
 * tours-data.json IN PLACE.
 *
 * Mutations are intentionally minimal:
 *   - For each tour that passed the gate, set
 *     priceConfidence: 'medium' and add priceSource: 'v52-dominant-gate'.
 *   - Everything else (price, priceLabel, all other fields) stays as-is.
 *
 * Tours that FAILed the gate, were already medium/high, or had no
 * captured price are NOT modified — preserving conservative blast
 * radius.
 *
 * Flag: --confirm  (required; without it, prints what would change and
 *                   exits 0 without writing)
 *
 * Backup: writes the pre-mutation file to /tmp/tours-data.<ISO>.bak
 *         before overwriting.
 *
 * Ported from wanderusvi/scripts-staging/apply-v52-live.js (the proven
 * pattern from wanderusvi PR #11). Only difference: input raw file path
 * and the wanderusvi 369332 canary check is removed (no WPR analogue).
 */

const fs = require('fs');

const TOURS_FILE = 'tours-data.json';
const RAW_FILE = 'scripts-staging/v52-wpr-dryrun-raw.json';
const CONFIRM = process.argv.includes('--confirm');

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

(function main() {
  if (!fs.existsSync(RAW_FILE)) {
    console.error(`Missing ${RAW_FILE}. Run the dry-run first:`);
    console.error('  node scripts-staging/run-v52-wpr-dryrun.js');
    process.exit(2);
  }

  const records = loadJson(RAW_FILE);
  const passes = records.filter(r => r.gate && r.gate.passed);

  console.log(`Loaded ${records.length} dry-run records.`);
  console.log(`Gate PASS: ${passes.length} (will be promoted low → medium)`);

  const dataRaw = fs.readFileSync(TOURS_FILE, 'utf8');
  const data = JSON.parse(dataRaw);
  const tours = data.tours || data;

  const beforeByConf = countByConf(tours);
  console.log('\nBefore:', beforeByConf);

  const passIds = new Set(passes.map(p => String(p.id)));
  let modified = 0;
  let alreadyMedium = 0;
  let notFound = 0;
  let notLow = 0;
  const promoted = [];

  for (const t of tours) {
    if (!passIds.has(String(t.id))) continue;
    if (t.priceConfidence === 'medium') { alreadyMedium++; continue; }
    if (t.priceConfidence !== 'low') { notLow++; continue; }
    t.priceConfidence = 'medium';
    t.priceSource = 'v52-dominant-gate';
    modified++;
    promoted.push({ id: t.id, name: t.name, price: t.price });
  }

  for (const id of passIds) {
    if (!tours.find(t => String(t.id) === id)) notFound++;
  }

  const afterByConf = countByConf(tours);
  console.log('After:  ', afterByConf);
  console.log(`\nMutations: ${modified} promoted, ${alreadyMedium} already medium, ${notLow} not low, ${notFound} not in file.`);

  // Card-flip counts using the same logic as app.js formatPrice gating.
  const beforeChecks = countCheckAvailability(JSON.parse(dataRaw).tours || JSON.parse(dataRaw));
  const afterChecks = countCheckAvailability(tours);
  const flipCount = beforeChecks - afterChecks;
  console.log(`\n"Check availability" tours: before=${beforeChecks}, after=${afterChecks}, flipped to "From $X": ${flipCount}`);

  if (!CONFIRM) {
    console.log('\n[DRY] No --confirm flag. tours-data.json was NOT written.');
    console.log('Re-run with --confirm to apply.');
    return;
  }

  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `/tmp/tours-data.${ts}.bak`;
  fs.writeFileSync(backupPath, dataRaw);
  console.log(`\nBackup: ${backupPath}`);

  // Write back, preserving original top-level shape
  const out = data.tours ? { ...data, tours } : tours;
  fs.writeFileSync(TOURS_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ Wrote ${TOURS_FILE} (${modified} tours promoted).`);

  // Print promoted IDs for the record
  console.log('\nPromoted IDs:');
  console.log(promoted.map(p => p.id).join(','));
})();

function countByConf(tours) {
  const c = { high: 0, medium: 0, low: 0, null: 0 };
  for (const t of tours) {
    const k = t.priceConfidence == null ? 'null' : t.priceConfidence;
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

function countCheckAvailability(tours) {
  // Mirrors app.js formatPrice: priceConfidence in {high, medium} && finite positive price → "From $X".
  let n = 0;
  for (const t of tours) {
    const validPrice = Number.isFinite(t.price) && t.price > 0;
    const promoted = t.priceConfidence === 'high' || t.priceConfidence === 'medium';
    if (!validPrice || !promoted) n++;
  }
  return n;
}
