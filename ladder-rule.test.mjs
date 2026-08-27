// node ladder-rule.test.mjs — proves the rule in both directions. Exit 0 only if every assertion holds.
import fs from 'node:fs'; import assert from 'node:assert/strict';
import { resolveLadder, seasonalSegment, reconcile, boundarySegments } from './ladder-rule.mjs';
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

// ===== s52 amendment: a ladder within ONE probe day is a candidate =====
const s49day = '2026-08-25', s52day = '2026-08-27';
const S49_DATES = ['2026-08-31', '2026-09-14', '2026-09-28', '2026-10-19'];

// 8. NEGATIVE — pk 707738, real two-session evidence. Day 1 (s49, 2026-08-25): $3991/$3991/$200/$200. Day 2 (2026-08-27): $3991 on every date.
const d1 = ev.perPk['707738'].probes.filter(p => !p.error && !p.absent);
assert.deepEqual(d1.map(p => p.tiers[0].priceCents), [399100, 399100, 20000, 20000]);
const r1 = resolveLadder(d1); assert.equal(r1.kind, 'seasonal', 'by shape alone this IS seasonal — which is the defect');
const rc1 = reconcile({ storedBasis: 'D-624 … PAYMENT $3991', res: r1, readings: d1, probeDay: s49day, dates: S49_DATES, anchorName: 'PAYMENT', source: 's49', storedPrice: 3991 });
assert.deepEqual(rc1.events, ['ladder-candidate']); assert.equal(rc1.hold, false, 'rung in force $3991 == stored → no hold, figure unchanged');
assert.match(rc1.segments[0], /^; SEASONAL-BOUNDARY \(candidate, single probe day 2026-08-25 — re-verify before asserting\): tier "PAYMENT" \$3991 valid-through >=2026-09-14 .* sampled=2026-08-31,2026-09-14; tier "PAYMENT" \$200 from <=2026-09-28 \[implausible-as-season: 95% swing\] sampled=2026-09-28,2026-10-19/);
ok('707738 day 1: CANDIDATE recorded (sampled dates + 95%-swing label), nothing written');
// day 2: real 2026-08-27 readings on the same dates — $3991 everywhere
const d2 = S49_DATES.map(d => T(d, [['PAYMENT', 399100]]));
const r2 = resolveLadder(d2); assert.equal(r2.kind, 'flat');
const rc2 = reconcile({ storedBasis: 'D-624 … PAYMENT $3991' + rc1.segments[0], res: r2, readings: d2, probeDay: s52day, dates: S49_DATES, anchorName: 'PAYMENT', source: 's52', storedPrice: 3991 });
assert.deepEqual(rc2.events, ['candidate-resolved-flat']); assert.deepEqual(rc2.segments, [], 'candidate dropped — no boundary ever asserted');
ok('707738 day 2: $3991 on all dates → candidate RESOLVED TO FLAT, no boundary');

// 9. POSITIVE — pk 389627. Day 1: real s49 evidence → candidate. Day 2: real 2026-08-27 daily-bracketed readings → promoted, 3 rungs.
const j1 = ev.perPk['389627'].probes.filter(p => !p.error && !p.absent);
const jr1 = resolveLadder(j1);
const jc1 = reconcile({ storedBasis: 'x', res: jr1, readings: j1, probeDay: s49day, dates: S49_DATES, anchorName: 'Jet Ski', source: 's49', storedPrice: 125 });
assert.deepEqual(jc1.events, ['ladder-candidate']); assert.equal(jc1.hold, false, '$125 in force == stored');
assert.equal(boundarySegments('x' + jc1.segments[0])[0].rungs.length, 3, 'candidate text carries all 3 rungs with sampled dates');
// 2026-08-27 readings actually taken (probe.mjs, this session): Aug 27-31 $115; Sep 1-30 $125; Oct 1-Dec 31 $155
const J2_DATES = ['2026-08-29', '2026-08-31', '2026-09-01', '2026-09-14', '2026-09-28', '2026-09-30', '2026-10-01', '2026-10-19', '2026-11-22'];
const j2 = J2_DATES.map(d => T(d, [['Jet Ski', d < '2026-09-01' ? 11500 : d < '2026-10-01' ? 12500 : 15500]]));
const jr2 = resolveLadder(j2); assert.equal(jr2.kind, 'seasonal'); assert.equal(jr2.runs.length, 3); assert.deepEqual(jr2.runs.map(r => r.confirmed), [true, true, true]);
const jc2 = reconcile({ storedBasis: 'x' + jc1.segments[0], res: jr2, readings: j2, probeDay: s52day, dates: J2_DATES, anchorName: 'Jet Ski', source: 's52', storedPrice: 125 });
assert.deepEqual(jc2.events, ['ladder-promoted', 'ladder-hold'], 'promoted; and since the rung in force on day 2 is the $115 Aug rung ≠ stored $125, the figure is HELD for a ruling, not written');
assert.match(jc2.segments[0], /^; SEASONAL-BOUNDARY \(asserted: candidate from probe day 2026-08-25 reproduced on probe day 2026-08-27\): tier "Jet Ski" \$115 valid-through 2026-08-31; tier "Jet Ski" \$125 from 2026-09-01 valid-through 2026-09-30; tier "Jet Ski" \$155 from 2026-10-01/);
assert.doesNotMatch(jc2.segments[0], /implausible/, '$115→$125→$155 are <50% swings: no label');
ok('389627 day 2: candidate PROMOTED to asserted boundary, 3 rungs bracketed to the day; figure held for ruling');

// 10. MIRROR IMAGE — cheap first, then expensive, within one probe day. Stored $200. Must NOT publish $3991.
const mir = [T('2026-08-31', [['PAYMENT', 20000]]), T('2026-09-14', [['PAYMENT', 20000]]), T('2026-09-28', [['PAYMENT', 399100]]), T('2026-10-19', [['PAYMENT', 399100]])];
const mr = resolveLadder(mir); assert.equal(mr.kind, 'seasonal'); assert.equal(mr.cur.tiers[0].priceCents, 20000);
const mc = reconcile({ storedBasis: '', res: mr, readings: mir, probeDay: s49day, dates: S49_DATES, anchorName: 'PAYMENT', source: 'x', storedPrice: 200 });
assert.equal(mc.hold, false); assert.deepEqual(mc.events, ['ladder-candidate']); assert.match(mc.segments[0], /candidate/); assert.match(mc.segments[0], /\$3991[^;]*\[implausible-as-season: 1895% swing\]/);
// and with stored $3991 the in-force $200 differs → HOLD (figure stays $3991)
const mc2 = reconcile({ storedBasis: '', res: mr, readings: mir, probeDay: s49day, dates: S49_DATES, anchorName: 'PAYMENT', source: 'x', storedPrice: 3991 });
assert.equal(mc2.hold, true); assert.deepEqual(mc2.events, ['ladder-candidate', 'ladder-hold']);
ok('mirror image within one probe day: candidate only; expensive figure never published; in-force ≠ stored → HOLD');

// 11. >50% swing is a LABEL, not a gate: a genuine steep season is still classified and promoted.
const steep1 = [T('2026-08-31', [['Adult', 10000]]), T('2026-09-14', [['Adult', 10000]]), T('2026-09-28', [['Adult', 25000]]), T('2026-10-19', [['Adult', 25000]])];
const sc1 = reconcile({ storedBasis: '', res: resolveLadder(steep1), readings: steep1, probeDay: s49day, dates: S49_DATES, anchorName: 'Adult', source: 'x', storedPrice: 100 });
const sc2 = reconcile({ storedBasis: sc1.segments[0], res: resolveLadder(steep1), readings: steep1, probeDay: s52day, dates: S49_DATES, anchorName: 'Adult', source: 'x', storedPrice: 100 });
assert.deepEqual(sc2.events, ['ladder-promoted']); assert.match(sc2.segments[0], /\$250[^;]*\[implausible-as-season: 150% swing\]/);
ok('steep genuine season (reproduced on a later day) is promoted WITH the label — the label never suppresses data');

// 12. PR #256 asserted boundaries survive the amendment: with a same-run candidate present (the s51 Sep-6 spike) AND without.
const B256 = '; SEASONAL-BOUNDARY: tier "Adult" $65 valid-through 2026-11-19; tier "Adult" $75 from 2026-11-20 (s52-wpr-seasonal, bracketed daily, re-read live 2026-08-27)';
const S51_DATES = ['2026-09-06', '2026-09-20', '2026-10-04', '2026-10-25'];
const spike = [T('2026-09-06', [['Adult', 7500]]), T('2026-09-20', [['Adult', 6500]]), T('2026-10-04', [['Adult', 6500]]), T('2026-10-25', [['Adult', 6500]])];
const pc = reconcile({ storedBasis: 'D-624 … Adult $65' + B256, res: resolveLadder(spike), readings: spike, probeDay: '2026-08-26', dates: S51_DATES, anchorName: 'Adult', source: 's51', storedPrice: 65 });
assert.deepEqual(pc.events, ['ladder-candidate', 'prior-boundary-carried']); assert.equal(pc.hold, false);
assert.equal(pc.segments[1], B256.replace('; SEASONAL-BOUNDARY: ', "; SEASONAL-BOUNDARY (prior, not re-verified: names dates outside this run's span 2026-09-06..2026-10-25): "), 'carried EXACTLY, only the qualifier prefix added');
const pf = reconcile({ storedBasis: 'D-624 … Adult $65' + B256, res: resolveLadder(spike.slice(1)), readings: spike.slice(1), probeDay: '2026-08-26', dates: S51_DATES.slice(1), anchorName: 'Adult', source: 's51', storedPrice: 65 });
assert.deepEqual(pf.events, ['prior-boundary-carried']);
ok('PR #256 asserted boundary carried exactly, with and without a same-run candidate — never demoted');

console.log(`\n${n} checks passed`);
