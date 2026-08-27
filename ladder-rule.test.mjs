// node ladder-rule.test.mjs — proves the rule in both directions. Exit 0 only if every assertion holds.
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { resolveLadder, seasonalSegment } from './ladder-rule.mjs';
const T = (date, tiers) => ({ date, tiers: tiers.map(([singular, priceCents]) => ({ singular, priceCents })) });
let n = 0; const ok = (m) => { n++; console.log('ok  ', m); };

// 1. REPLAY pk 389627 from the real s49 evidence. The old rule wrote $125 (2 of 4 dates). Three rungs must survive.
const ev = JSON.parse(fs.readFileSync('_evidence/s49-wpr-refresh/probe.json', 'utf8'));
const s = ev.perPk['389627'].probes.filter(p => !p.error && !p.absent);
const old = (() => { const key = p => JSON.stringify(p.tiers.map(x => [x.singular, x.priceCents])); const c = new Map(); for (const p of s) c.set(key(p), (c.get(key(p)) || 0) + 1); return s.find(p => key(p) === [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]); })();
assert.equal(old.tiers[0].priceCents, 12500, 'old majority rule reproduces the $125 defect');
const r = resolveLadder(s);
assert.equal(r.kind, 'seasonal'); assert.equal(r.runs.length, 3);
assert.deepEqual(r.runs.map(x => [x.first, x.last, x.rep.tiers[0].priceCents]), [['2026-08-31', '2026-08-31', 11500], ['2026-09-14', '2026-09-28', 12500], ['2026-10-19', '2026-10-19', 15500]]);
assert.equal(r.cur.tiers[0].priceCents, 12500, 'rung in force = earliest rung confirmed on >=2 dates (Sep 14+28 → $125); the single-date $115 and $155 rungs are recorded, not written');
assert.deepEqual(r.runs.map(x => x.confirmed), [false, true, false]);
const seg = seasonalSegment(r, 'Jet Ski', 's49-wpr-refresh');
assert.match(seg, /SEASONAL-BOUNDARY: tier "Jet Ski" \$115 valid-through >=2026-08-31 \(boundary between 2026-08-31 and 2026-09-14 not bracketed to the day\) \(single sampled date 2026-08-31 — unconfirmed rung, not written\); tier "Jet Ski" \$125 from <=2026-09-14 valid-through >=2026-09-28 \(boundary between 2026-09-28 and 2026-10-19 not bracketed to the day\); tier "Jet Ski" \$155 from <=2026-10-19 \(single sampled date 2026-10-19 — unconfirmed rung, not written\)/);
ok('389627 replay: old rule → $125 and DISCARDED the shape; new rule → seasonal, all 3 rungs $115/$125/$155 recorded with their date intervals, $125 written as the only rung confirmed on >=2 dates');
console.log('     ' + seg);

// 2. FLAT fixture: identical ladder on every date → flat, no segment.
const flat = resolveLadder([T('2026-09-06', [['Adult', 6500], ['Child', 5500]]), T('2026-09-20', [['Adult', 6500], ['Child', 5500]]), T('2026-10-04', [['Adult', 6500], ['Child', 5500]]), T('2026-10-25', [['Adult', 6500], ['Child', 5500]])]);
assert.equal(flat.kind, 'flat'); assert.equal(seasonalSegment(flat, 'Adult', 'x'), ''); ok('flat fixture: kind=flat, no SEASONAL-BOUNDARY emitted');

// 3. WOBBLE fixture (real shape from piratesnorkelingshack 6350): different tier NAMES exposed per date, no shared name differs in price.
const wob = resolveLadder([T('2026-09-20', [['Piñero Island', 105000]]), T('2026-10-25', [['Piñero Island', 105000]]), T('2026-11-22', [['Icacos and Palomino Island', 105000]])]);
assert.equal(wob.kind, 'wobble'); assert.equal(wob.cur.tiers[0].singular, 'Piñero Island'); assert.equal(seasonalSegment(wob, 'Piñero Island', 'x'), ''); ok('wobble fixture: tier-set differs, price does not → not a ladder, no segment');

// 4. ALTERNATING fixture (real shape from 261733): A B A → refuse.
const alt = resolveLadder([T('2026-09-20', [['Couple', 5000]]), T('2026-10-25', [['Couple', 16500]]), T('2026-11-22', [['Couple', 5000]])]);
assert.equal(alt.kind, 'alternating'); assert.equal(alt.cur, null); ok('alternating fixture: A B A → kind=alternating, cur=null (caller must hold and report)');

// 5. DAY-BRACKETED boundary: consecutive sampled dates → stated to the day, #256 form exactly.
const br = resolveLadder([T('2026-09-30', [['Jet Ski', 12500]]), T('2026-10-01', [['Jet Ski', 15500]])]);
assert.equal(br.kind, 'seasonal-unconfirmed'); assert.equal(br.cur, null); ok('two dates, two prices → seasonal-unconfirmed, nothing written (a rung needs >=2 dates)');
const br2 = resolveLadder([T('2026-09-29', [['Jet Ski', 12500]]), T('2026-09-30', [['Jet Ski', 12500]]), T('2026-10-01', [['Jet Ski', 15500]]), T('2026-10-02', [['Jet Ski', 15500]])]);
assert.equal(seasonalSegment(br2, 'Jet Ski', 'x'), '; SEASONAL-BOUNDARY: tier "Jet Ski" $125 valid-through 2026-09-30; tier "Jet Ski" $155 from 2026-10-01 (x, 2 rungs from 4 dated readings; rung in force = earliest rung confirmed on >=2 dates, 2026-09-29..2026-09-30)');
ok('day-bracketed boundary renders in the exact PR #256 form (valid-through 2026-09-30; from 2026-10-01)');
// 5b. ZERO is not a price: a tier at $0 on later dates (calendar closed) must be flat, not a ladder — 27 of 30 first-replay "ladders" were this.
const z = resolveLadder([T('2026-08-31', [['Visitor', 17500]]), T('2026-09-14', [['Visitor', 17500]]), T('2026-09-28', [['Visitor', 17500]]), T('2026-10-19', [['Visitor', 0]])]);
assert.equal(z.kind, 'flat'); assert.equal(z.zeroOnly, 1); assert.equal(z.cur.tiers[0].priceCents, 17500); ok('price → $0 on a later date: flat, zero-only reading excluded, no ladder');
const z2 = resolveLadder([T('2026-09-06', [['Adults', 4000], ['Child', 4000]]), T('2026-09-20', [['Adults', 4000], ['Child', 4000]]), T('2026-10-04', [['Adults', 4000], ['Child', 0]])]);
assert.equal(z2.kind, 'wobble'); ok('one tier → $0 while the other holds: wobble, not a ladder');
// 5c. HOLIDAY SPIKE on the earliest date (real s51 shape, 168561 Sep 6 Labor Day): the spike is recorded as unconfirmed, $65 is in force.
const hs = resolveLadder([T('2026-09-06', [['Adult', 7500]]), T('2026-09-20', [['Adult', 6500]]), T('2026-10-04', [['Adult', 6500]]), T('2026-10-25', [['Adult', 6500]])]);
assert.equal(hs.kind, 'seasonal'); assert.equal(hs.cur.tiers[0].priceCents, 6500); assert.match(seasonalSegment(hs, 'Adult', 'x'), /\$75 valid-through >=2026-09-06.*unconfirmed rung, not written.*\$65 from <=2026-09-20/);
ok('holiday spike on the earliest date is recorded as an unconfirmed rung; the confirmed $65 is written');

// 6. Anchor tier ABSENT on a rung is reported as such, not priced (Adult exposed only on rung 1; rung 2 differs on Minor).
const ab = resolveLadder([T('2026-09-20', [['Adult', 6500], ['Minor', 8000]]), T('2026-10-25', [['Minor', 9000]]), T('2026-11-22', [['Minor', 9000]])]);
assert.equal(ab.kind, 'seasonal'); assert.equal(ab.runs.length, 2); assert.equal(ab.cur.tiers[0].priceCents, 9000, 'in force = the confirmed Oct-Nov rung');
assert.match(seasonalSegment(ab, 'Adult', 'x'), /tier "Adult" \$65 valid-through >=2026-09-20 \(boundary between 2026-09-20 and 2026-10-25 not bracketed to the day\) \(single sampled date 2026-09-20 — unconfirmed rung, not written\); tier "Adult" anchor tier absent from <=2026-10-25/);
ok('anchor tier absent on a rung → "anchor tier absent", never a guessed figure');

// 7. Adult 65 → Minor-only → Adult 75: the Minor-only reading has no shared tier, joins rung 1; Adult 75 differs → 2 rungs. Seasonal, not wobble.
const mx = resolveLadder([T('2026-09-20', [['Adult', 6500]]), T('2026-10-25', [['Minor', 7500]]), T('2026-11-22', [['Adult', 7500]])]);
assert.equal(mx.kind, 'seasonal'); assert.equal(mx.runs.length, 2); assert.equal(mx.cur.tiers[0].priceCents, 6500); ok('mixed exposure across a real step → seasonal, 2 rungs, in force = the 2-reading rung');
console.log(`\n${n} checks passed`);
