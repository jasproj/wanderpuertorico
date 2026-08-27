// ladder-rule.mjs — shared rule for reconciling several DATED price-preview readings of one item.
//
// Replaces the "majority ladder" pick in s49-wpr-refresh.mjs / s51-wpr-unstamped.mjs, which wrote whichever
// tier-set appeared on the most sampled dates. Its own evidence recorded "3 ladder shape(s)" for pk 389627
// ($115 / $125 / $155 on Aug 31 / Sep 14+28 / Oct 19) and it still wrote $125, discarding a real seasonal
// structure. Detection existed; a rule did not. This is the rule.
//
// Readings are classified, never voted on:
//   flat        — one price shape across every sampled date. Unchanged behaviour.
//   wobble      — >1 tier-set, but NO tier name that appears on two dates carries two different prices
//                 (price-preview exposes a different availability's tier names on different dates —
//                 "Piñero Island" vs "Icacos"; 1-hour vs all-day rental). Not a ladder: the largest tier-set
//                 is the representative reading. A sampling wobble on a flat price is never a seasonal record.
//   seasonal    — >1 price shape AND each shape occupies ONE contiguous run of sampled dates (A A B B, never
//                 A B A). The rung IN FORCE is the earliest run supported by >=2 sampled dates — a rung seen on a
//                 single date cannot be told from a one-day holiday spike (s51 evidence: Sep 6 Labor Day read $75
//                 on 168561 where Sep 20..Oct 25 read $65) and is RECORDED as "unconfirmed", never written as the
//                 price. Every rung, confirmed or not, is recorded
//                 in priceBasis in the SEASONAL-BOUNDARY form established by PR #256. A boundary is stated to
//                 the day only when the sampled dates bracket it to the day; otherwise it is reported as the
//                 interval between the last date of one run and the first date of the next — never guessed.
//   seasonal-unconfirmed — >1 price shape, contiguous, but NO rung is supported by two or more sampled dates
//                 (two dates, two prices). Nothing can be called "in force"; the caller holds and reports.
//   alternating — >1 price shape and the shapes interleave by date (261733: "Couple" $50 / $165 day to day —
//                 two products on one item, not a season). Not writable by rule: the caller must leave the row
//                 untouched and report it for a ruling.
//
// A tier priced $0 on a date is NOT a price (the operator's calendar is closed / the tier is not sold that day — 27 of
// the 30 "ladders" a first replay found were price→$0 on the October dates). $0 tiers are ignored when comparing
// readings, and a reading with no priced tier at all does not participate in ladder detection.
//
// Every outcome is counted by the caller (disposition) and printed — the original defect was silent.
export function resolveLadder(sampled) {
  const byDateAll = [...sampled].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const priced = p => p.tiers.filter(x => x.priceCents > 0);
  const byDate = byDateAll.filter(p => priced(p).length > 0);          // zero-only readings are not prices
  const priceMap = p => { const m = new Map(); for (const x of priced(p)) m.set(x.singular, x.priceCents); return m; };
  const priceDiffer = (a, b) => { const A = priceMap(a), B = priceMap(b); for (const [n, c] of A) if (B.has(n) && B.get(n) !== c) return true; return false; };
  const tierSets = new Set(byDate.map(p => JSON.stringify(priced(p).map(x => [x.singular, x.priceCents]))));
  if (byDate.length === 0) return { kind: 'flat', cur: byDateAll[0], runs: [], shapes: 0, tierSets: 0, zeroOnly: byDateAll.length };
  // group readings into price shapes: two readings share a shape iff no common priced tier name differs in price
  const shapes = [];   // { readings: [], rep }
  for (const p of byDate) {
    const s = shapes.find(s => s.readings.every(q => !priceDiffer(p, q)));
    if (s) { s.readings.push(p); if (priced(p).length > priced(s.rep).length) s.rep = p; } else shapes.push({ readings: [p], rep: p });
  }
  const base = { shapes: shapes.length, tierSets: tierSets.size, zeroOnly: byDateAll.length - byDate.length };
  if (shapes.length === 1) return { kind: tierSets.size === 1 ? 'flat' : 'wobble', cur: shapes[0].rep, runs: [], ...base };
  // >1 price shape: contiguous runs by date?
  const runs = []; for (const p of byDate) { const s = shapes.indexOf(shapes.find(s => s.readings.includes(p))); const last = runs[runs.length - 1]; if (last && last.shape === s) { last.last = p.date; last.readings.push(p); } else runs.push({ shape: s, first: p.date, last: p.date, readings: [p], rep: shapes[s].rep }); }
  const seen = new Set(); for (const r of runs) { if (seen.has(r.shape)) return { kind: 'alternating', cur: null, runs, ...base }; seen.add(r.shape); }
  for (const r of runs) r.confirmed = r.readings.length >= 2;
  const inForce = runs.find(r => r.confirmed);
  if (!inForce) return { kind: 'seasonal-unconfirmed', cur: null, runs, ...base };
  for (const r of runs) r.inForce = r === inForce;
  return { kind: 'seasonal', cur: inForce.rep, runs, ...base };
}

const dollars = c => (c / 100).toFixed(2).replace(/\.?0+$/, '');
const dayBefore = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
const nextDay = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

// priceBasis segment for a seasonal ladder, on the tier that anchors the published figure. Same greppable form as
// PR #256: `SEASONAL-BOUNDARY: tier "X" $a valid-through D1; tier "X" $b from D2`. A boundary bracketed to the day
// (consecutive sampled dates) is stated as such; otherwise `valid-through >=D1 ... from <=D2 (boundary between D1
// and D2 not bracketed to the day)`. A rung on which the anchor tier is absent is reported as such, not priced.
export function seasonalSegment(res, anchorName, source) {
  if (res.kind !== 'seasonal') return '';
  const parts = []; const R = res.runs;
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; const tier = r.rep.tiers.find(x => x.singular === anchorName);
    const fig = tier ? `$${dollars(tier.priceCents)}` : 'anchor tier absent';
    const prev = R[i - 1], next = R[i + 1];
    const from = !prev ? '' : (nextDay(prev.last) === r.first ? ` from ${r.first}` : ` from <=${r.first}`);
    const thru = !next ? '' : (nextDay(r.last) === next.first ? ` valid-through ${r.last}` : ` valid-through >=${r.last}`);
    const brk = next && nextDay(r.last) !== next.first ? ` (boundary between ${r.last} and ${next.first} not bracketed to the day)` : '';
    const conf = r.confirmed ? '' : ` (single sampled date ${r.first} — unconfirmed rung, not written)`;
    parts.push(`tier "${anchorName}" ${fig}${from}${thru}${brk}${conf}`);
  }
  const f = R.find(r => r.inForce);
  return `; SEASONAL-BOUNDARY: ${parts.join('; ')} (${source}, ${R.length} rungs from ${R.reduce((n, r) => n + r.readings.length, 0)} dated readings; rung in force = earliest rung confirmed on >=2 dates, ${f.first}..${f.last})`;
}
