#!/usr/bin/env node
// s49-wpr-refresh: 89-day price-stamp refresh (WPR port of WENG s48-weng-refresh-a, D-613 lineage).
//   Population: priceEnrichmentAt starts with 2026-05-28 MINUS rows carrying priceSource
//   s49-wpr-anchorfix (PR #250, probed live 2026-08-25, untouched). Re-derived in-branch at run time.
//   Endpoint/batching/join-by-id per the repo-root extract-prices-v7-api.js (origin of the tracked writer) (D-613
//   lineage): price-preview/per-item/v2, include_breakdown=yes, ≤20 pks per request,
//   1 req/s, dated requests (date-validity instrument, D-606).
//   Anchor rule (D-624): cheapest ADULT/BASE per-person tier anchors "From". Child/infant/
//   concession/family-bundle/add-on/gratuity tiers never anchor. Same-customer-type ladders
//   split by departure logistics are one product (D-625) — the cheapest base tier wins.
//   Whole-party-only ladders → HELD low with basis (D-621; no priceUnit render path yet).
//   Absent on every date → UNSAMPLED, low, reason stamped. All-zero ladder → zero_price, low.
//   Non-USD live currency → D-620 hold, true currency + amount stamped, low.
//   usage: node s49-wpr-refresh.mjs probe|apply [--dry-run]
import fs from 'node:fs';
import { resolveLadder, reconcile } from './ladder-rule.mjs';   // s52: replaces the majority-ladder pick (see that file's header)
const FILE = 'tours-data.json';
const EV = '_evidence/s49-wpr-refresh';
const SOURCE = 's49-wpr-refresh';
const STAMP_DAY = '2026-08-25';
const DATES = ['2026-08-31', '2026-09-14', '2026-09-28', '2026-10-19'];
const BATCH = 20, RATE_MS = 1000, TIMEOUT_MS = 25000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const mode = process.argv[2]; const DRY = process.argv.includes('--dry-run');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const u = c => Number((c / 100).toFixed(2));

function parseFhUrl(bookingUrl) {   // identical to v7
  if (!bookingUrl || !bookingUrl.includes('fareharbor.com')) return null;
  const m = bookingUrl.match(/fareharbor\.com\/(?:embeds\/book\/)?([^/]+)\/items\/(\d+)/);
  if (!m) return null; const [, shortname, pk] = m;
  if (shortname === 'embeds' || shortname === 'items') return null;
  return { shortname, pk: Number(pk) };
}
const raw = fs.readFileSync(FILE, 'utf8'); const doc = JSON.parse(raw);
// D-599 adapted for WPR: the file is written by Python (json.dumps indent=2, ensure_ascii=False) and carries
// integral floats like 1325.0 that JS cannot reproduce (pre-existing at 3ddaec2). The guard therefore compares
// after normalising those, and apply() emits a per-pk PATCH that apply-patch.py writes with Python's serializer
// (byte-identical round-trip proven), carrying the rows-outside-population guard with it.
if ((JSON.stringify(doc, null, 2) + '\n') !== raw.replace(/(\d)\.0(?=,?\n)/g, '$1')) { console.error('ABORT: no byte round-trip beyond integral floats (D-599)'); process.exit(2); }
const inA = t => typeof t.priceEnrichmentAt === 'string' && t.priceEnrichmentAt.startsWith('2026-05-28');
let pop = doc.tours.filter(t => inA(t) && t.priceSource !== 's49-wpr-anchorfix');
// s52 REPLAY knob (dry-run only): REPLAY_PKS=389627,4287 or REPLAY_PKS=ALL replays rows against the evidence bundle regardless of
// their current stamp, so the ladder rule can be proven on real probe data after the population has been stamped. Never writes.
if (process.env.REPLAY_PKS) { if (!DRY) { console.error('ABORT: REPLAY_PKS requires --dry-run'); process.exit(8); }
  const want = process.env.REPLAY_PKS === 'ALL' ? null : new Set(process.env.REPLAY_PKS.split(',').map(Number));
  const evPks = new Set(Object.keys(JSON.parse(fs.readFileSync(`${EV}/probe.json`, 'utf8')).perPk).map(Number));   // only rows the bundle actually probed
  pop = doc.tours.filter(t => (want ? want.has(t.pk) : true) && evPks.has(t.pk)); }
const excluded = doc.tours.filter(t => inA(t) && t.priceSource === 's49-wpr-anchorfix').length;
console.error(`population A=${doc.tours.filter(inA).length} minus s49-anchorfix=${excluded} -> ${pop.length}`);
for (const t of pop) { const p = parseFhUrl(t.bookingUrl); if (!p || p.pk !== t.pk) { console.error('ABORT: bookingUrl pk mismatch', t.pk); process.exit(2); } }

async function get(url, ms) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ac.signal });
    if (r.status !== 200) return { err: 'HTTP ' + r.status }; return { j: await r.json() }; }
  catch (e) { return { err: String(e.name === 'AbortError' ? 'timeout' : e.message) }; } finally { clearTimeout(tm); }
}
const batchUrl = (sn, pks, date) => `https://fareharbor.com/api/embed/${sn}/price-preview/per-item/v2/?item_pks=${pks.join(',')}&include_breakdown=yes&date=${date}`;

async function probe() {
  const bySn = new Map();
  for (const t of pop) { const { shortname } = parseFhUrl(t.bookingUrl); if (!bySn.has(shortname)) bySn.set(shortname, []); bySn.get(shortname).push(t.pk); }
  const out = { startedAt: new Date().toISOString(), dates: DATES, population: pop.length, shortnames: bySn.size, requests: 0, retries: [], perPk: {} };
  for (const t of pop) out.perPk[t.pk] = { probes: [] };
  // one request per (shortname, chunk, date); on timeout/5xx split the chunk in half and retry once per half (bounded)
  async function run(sn, pks, date, depth) {
    out.requests++;
    const x = await get(batchUrl(sn, pks, date), TIMEOUT_MS); await sleep(RATE_MS);
    if (x.err && /timeout|HTTP 5/.test(x.err) && pks.length > 1 && depth < 2) {
      out.retries.push({ sn, date, size: pks.length, err: x.err, split: true });
      const h = Math.ceil(pks.length / 2); await sleep(2000);
      await run(sn, pks.slice(0, h), date, depth + 1); await run(sn, pks.slice(h), date, depth + 1); return;
    }
    const items = new Map(((x.j && x.j.items) || []).map(it => [Number(it.id), it]));
    for (const pk of pks) {
      const it = items.get(pk); const p = { date, error: x.err || null };
      if (!x.err) { p.absent = !it; p.liveCurrency = x.j.details?.currency ?? null; p.includeFees = x.j.details?.prices_include_booking_fees ?? null; p.includeTaxes = x.j.details?.prices_include_taxes ?? null; }
      if (it) { const sa = it.availability?.start_at || null; p.start_at = sa; p.dateValid = !!sa && sa.slice(0, 10) === date;
        const cts = Array.isArray(it.price?.breakdown?.customer_types) ? it.price.breakdown.customer_types : [];
        p.tiers = cts.map(c => ({ id: c.id, singular: c.singular, plural: c.plural, note: c.note, priceCents: c.price, min: c.min_party_size }));
        p.low = it.price?.low ?? null; p.zeroOnly = !cts.some(c => c.price > 0); }
      out.perPk[pk].probes.push(p);
    }
  }
  let n = 0;
  for (const [sn, pks] of bySn) {
    for (let i = 0; i < pks.length; i += BATCH) for (const date of DATES) await run(sn, pks.slice(i, i + BATCH), date, 0);
    n++; if (n % 10 === 0) process.stderr.write(`${n}/${bySn.size} operators, ${out.requests} req\n`);
    fs.writeFileSync(`${EV}/probe.json`, JSON.stringify(out));
  }
  out.finishedAt = new Date().toISOString();
  // reconcile: every population pk must have exactly DATES.length probe entries
  const bad = Object.entries(out.perPk).filter(([, v]) => v.probes.length !== DATES.length);
  out.reconcile = { population: pop.length, pksWithFullProbeSet: pop.length - bad.length, incomplete: bad.map(([k]) => k) };
  fs.writeFileSync(`${EV}/probe.json`, JSON.stringify(out));
  console.log(JSON.stringify({ requests: out.requests, retries: out.retries.length, reconcile: out.reconcile }));
}

// ---- tier classification (D-624 / D-625 / D-621) ----
const NEVER = /\b(child|childs|child's|children|childrens|children's|kid|kids|kid's|infant|infants|baby|babies|toddler|junior|juniors|youth|youths|teen|teenager|teens|adolescent|adolescents|young adult|student|students|senior|seniors|oap|concession|concessions|pensioner|disabled|wheelchair|carer|companion|blue light|nhs|discount|under\s*\d+s?|\d+\s*(and|&)\s*under|family|families|bundle|package|add[- ]?on|extra|extras|additional|supplement|upgrade|gratuity|tip|tips|donation|deposit|voucher|gift card|redemption|per additional|spectator|non[- ]?participant|dog|dogs|pet|pets|kit|merchandise|parking|niño|niños|niña|niñas|bebé|bebe|infante|enfant|enfants|bébé|kind|kinder|bambino|bambini|neonato|neonati|ragazzo|ragazzi|ragazza|ragazze|儿童|孩子|学生|老年|优惠)\b|儿童|孩子|学生|老年|优惠/i;
// an age band needs an age marker — a bare numeric range ("Private Group 1-4", "Groups of 2 - 4") is a party size, not an age
const AGE_RANGE = /\b\d{1,2}\s*(-|–|to)\s*\d{1,2}\s*(yrs|rys|years|year olds|yr olds|y\/o|y\/old|yo|años|ans|anni)\b/i;
// word-number party tiers ("Two Adults", "Three People") are group-size variants — the single-person tier anchors (s47 VOLUME-LADDER closure)
const WORDNUM = '(two|three|four|five|six|seven|eight|nine|ten|twelve|\\d+)';
const GROUP = new RegExp('\\b(per group|group|groups|party|parties|private|exclusive|charter|boat|vessel|vehicle|car|van|minibus|coach|table|room|cabin|pod|lane|court|couple|couples|for two|for 2|whole|hire|rental|raft|canoe|kayak|seater|privado|privada|vehículo|vehiculo|grupo|nights?|berth|capacity|hasta \\d+|' + WORDNUM + '\\s*(people|persons|ppl|pax|guests|players|riders|passengers|adults|students|pasajeros|personas)|up to \\d+)\\b', 'i');
const BASE_WORDS = 'adult|adults|person|per person|standard|general|guest|guests|visitor|participant|passenger|rider|player|ticket|seat|single|individual|one person|1 person|per seat';
const BASE = new RegExp('\\b(' + BASE_WORDS + ')\\b', 'i');
const BASE_HEAD = new RegExp('^(' + BASE_WORDS + ')\\b', 'i');
// explicit unit wording in the note settles the unit either way
const PER_PERSON = /\b(per (person|player|participant|head|adult|guest|rider|passenger|student|pp))\b|\beach person\b|\bpp\b|\b(1|one) (person|student|player)\b(?!\s*(or|to|-|–))/i;
const NOTE_NEVER = /^\s*extras?\b|\ban (optional )?extra\b|\bprice per item\b|\badd[- ]on\b/i;
// a leading party size of 2+ ("3-4 adults", "2 - 4 Guests Rate", "5 + Guests") is a group-size variant too; "1-2 adults" is the entry tier and stays base
const VOLUME = new RegExp('^(' + WORDNUM + '\\s*(people|persons|adults|guests|players|passengers|students)|groups? of|([2-9]|\\d{2,})\\s*(-|–|to|\\+)\\s*\\d*\\s*(people|persons|adults|guests|players|passengers|students))\\b', 'i');
const NAME_GROUP = /\b(hire|rental|charter|private|boat|narrowboat|cruiser|vessel)\b/i;
// ---- WPR vocabulary overlay (s49, calibrated on the 2026-08-25 dry run; see PR) ----
const WPR_NEVER = /\b(compass|dive computer|wet ?suit|non-?climber|minor|minors|dep[oó]sito|deposit|deposits|canadian|weight per lb|tank refill|dive light)\b/i;   // add-on gear, spectator, age concession, deposit tiers, nationality discount
const WPR_GROUP = /\b(one|1)\s+(utv|atv|jet ?ski|boat|vehicle|kayak|cart|scooter|van|car)\b|\butv\b|\bcabin\b/i;                                            // per-vehicle tiers ('One UTV - 4 Person…' is not per person)
const WPR_ENTRY = /^(1|one)\s+(traveler|traveller|person|people|guest|passenger)s?\b/i;                                                                  // the single-traveller entry tier of a party-size ladder anchors
const WPR_VOLUME_NOUN = /^(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(travelers|travellers|people)\b|\b\d+\s+(students|people|persons|guests)\s+or\s+more\b/i;                                  // 'N travelers' party tiers are group-size variants
const WPR_LESSON_WORD = /\b(student|students|lesson package|kite package|wing package|kite)\b/i; const WPR_LESSON_PRODUCT = /\b(lesson|lessons|course|courses|certification|cpr|class|classes|school|kitecation|kiteboarding)\b/i;
function classifyTier(t, productName) {
  const sing = (t.singular || '').trim(); const note = t.note || '';
  if (!(t.priceCents > 0)) return 'zero';
  if (WPR_NEVER.test(sing)) return 'never';
  if (WPR_ENTRY.test(sing)) return 'base';
  if (WPR_VOLUME_NOUN.test(sing)) return 'group';
  if (WPR_GROUP.test(sing)) return 'group';
  if (WPR_LESSON_WORD.test(sing) && WPR_LESSON_PRODUCT.test(productName || '') && !NEVER.test(sing.replace(WPR_LESSON_WORD, ''))) return 'base';   // 'CPR STUDENT', 'Spear Student', 'Six Hour Lesson Package': the learner IS the base customer on a lesson product
  if (NEVER.test(sing) || AGE_RANGE.test(sing)) return 'never';     // never-anchor is decided by the tier NAME — notes carry age advisories for base tiers too …
  if (NOTE_NEVER.test(note)) return 'never';                          // … except explicit add-on wording in the note ("Extra – Boots (Price Per Item)", s48-weng-floorfix)
  if (VOLUME.test(sing)) return 'group';                              // "Two Adults", "Six Adults", "Three People": group-size variants rank behind the single-person tier
  if (BASE_HEAD.test(sing)) return 'base';                            // head noun decides: "Participant (Groups of 2 - 4)" is per person
  if (BASE.test(sing) && !GROUP.test(sing)) return 'base';
  if (PER_PERSON.test(note)) return 'base';                           // "Per Player", "Price per person", "20 Shots per person"
  if (GROUP.test(sing) || GROUP.test(note)) return 'group';           // "Group of 1 Player", "Price per Boat", "Accommodates 1 - 8 passengers"
  if (NAME_GROUP.test(productName || '')) return 'group';             // unnamed tier ("Two Hours", "3 Nights") on a hire/charter/private product is priced per unit, not per person
  return 'base';   // unnamed variant ("Half Day", "Two Hour Session", "20 Shots") is a per-person base tier under D-625; minPartySize never makes a tier whole-party
}

function apply() {
  const ev = JSON.parse(fs.readFileSync(`${EV}/probe.json`, 'utf8'));
  if (ev.reconcile.incomplete.length) { console.error('ABORT: probe incomplete'); process.exit(5); }
  if (!process.env.REPLAY_PKS && (ev.population !== pop.length)) { console.error('ABORT: population drift since probe'); process.exit(5); }
  // date-validity instrument: at least one start_at must move across dates for some row
  const moved = Object.values(ev.perPk).some(v => new Set(v.probes.filter(p => p.start_at).map(p => p.start_at)).size > 1);
  if (!moved) { console.error('ABORT: date parameter ignored (no start_at moved)'); process.exit(6); }
  const appliedAt = new Date().toISOString();
  // priceEnrichmentAt is locked to the ruling's stamp day (2026-08-25); the wall-clock apply time is recorded in the evidence bundle.
  const ts = `${STAMP_DAY}T${appliedAt.slice(11)}`;
  const before = doc.tours.map(t => JSON.stringify(t)); const popSet = new Set(pop.map(t => t.pk));
  const summary = []; const disp = {}; const ladders = { detected: 0 };   // s52: ladder outcomes are counted, never silent
  const bump = k => { disp[k] = (disp[k] || 0) + 1; };
  for (const t of pop) {
    const v = ev.perPk[t.pk]; const ok = v.probes.filter(p => !p.error); const sampled = ok.filter(p => !p.absent);
    const old = { price: t.price, label: t.priceLabel, conf: t.priceConfidence, basis: t.priceBasis };
    const rec = { pk: t.pk, name: t.name, old: old.price, oldLabel: old.label };
    const tiersOf = p => p.tiers.map(x => ({ name: x.singular, note: x.note || '', price: u(x.priceCents), minPartySize: x.min ?? null }));
    if (sampled.length === 0) {
      t.priceConfidence = 'low'; t.priceSource = SOURCE; t.priceEnrichmentAt = ts; t.priceEnrichmentStatus = ok.length ? 'unsampled' : 'probe_error';
      t.priceBasis = `UNSAMPLED: absent from price-preview items[] on ${ok.length}/${DATES.length} dated probes (${DATES.join(', ')})${ok.length < DATES.length ? `, ${DATES.length - ok.length} probe error(s)` : ''}; stored ${old.price == null ? 'null' : '$' + old.price}${old.label ? ` (${old.label})` : ''} retained unpublished pending a live reading`;
      t.priceTiers = (t.priceBreakdown || []).map(x => ({ name: x.singular, note: x.note || '', price: x.price, minPartySize: x.minPartySize ?? null }));
      Object.assign(rec, { disposition: ok.length ? 'UNSAMPLED' : 'PROBE_ERROR', new: t.price, probeErrors: v.probes.filter(p => p.error).map(p => p.error) }); bump(ok.length ? 'UNSAMPLED' : 'PROBE_ERROR'); summary.push(rec); continue;
    }
    // s52 ladder rule (ladder-rule.mjs) — the readings are CLASSIFIED, not voted on. The former majority pick wrote $125 for
    // pk 389627 over a real $115/$125/$155 seasonal ladder its own evidence recorded as "3 ladder shape(s)".
    //   flat / wobble → representative reading, unchanged behaviour;  seasonal → the rung in force at the EARLIEST sampled
    //   date is written and every rung is recorded as SEASONAL-BOUNDARY (PR #256 form) on the anchor tier;  alternating →
    //   row left untouched, reported for a ruling. Every kind is counted in `ladders` and printed with the run summary.
    const lad = resolveLadder(sampled);
    ladders[lad.kind] = (ladders[lad.kind] || 0) + 1; if (lad.kind !== 'flat' && lad.kind !== 'wobble') ladders.detected++;
    const ladderRuns = () => lad.runs.map(r => ({ first: r.first, last: r.last, readings: r.readings.length, tiers: r.rep.tiers.map(x => [x.singular, x.priceCents]) }));
    if (lad.kind === 'alternating' || lad.kind === 'seasonal-unconfirmed') {
      const d = lad.kind === 'alternating' ? 'LADDER-ALTERNATING' : 'LADDER-UNCONFIRMED';   // untouched, reported: two products on one item / no rung seen on >=2 dates
      Object.assign(rec, { disposition: d, new: old.price, ladder: ladderRuns() }); bump(d); summary.push(rec); continue;
    }
    const maj = lad.cur;
    // s52 candidate/re-verify (ladder-rule.mjs reconcile): a ladder seen within ONE probe day is recorded as a candidate and
    // never moves the stored figure; a later probe day that reproduces it promotes it; asserted segments (PR #256) are
    // carried forward exactly when this run's dates cannot see them. probeDay is the bundle's startedAt — mechanical.
    const probeDay = String(ev.startedAt || '').slice(0, 10);
    const ladderNote = anchorName => {
      const r = reconcile({ storedBasis: old.basis, res: lad, readings: sampled, probeDay, dates: DATES, anchorName, source: SOURCE, storedPrice: old.price });
      for (const e of r.events) { bump(e); ladders[e] = (ladders[e] || 0) + 1; }
      if (r.hold) { t.price = old.price; t.priceLabel = old.label; t.priceConfidence = old.conf; rec.disposition = 'LADDER-HOLD'; rec.new = old.price; rec.heldInForce = lad.cur.tiers.map(x => [x.singular, x.priceCents]); }
      else if (r.events.length) rec.disposition += '+' + r.events.join('+');
      t.priceBasis += r.segments.join(''); if (lad.kind === 'seasonal') rec.ladder = ladderRuns(); rec.basis = t.priceBasis;
    };
    const valid = sampled.filter(p => p.dateValid).length;
    const evid = `${sampled.length}/${DATES.length} dated readings (${valid} date-valid), ${lad.tierSets} tier-set(s), ${lad.shapes} price shape(s) [${lad.kind}]`;
    const cur = maj.liveCurrency; const L = tiersOf(maj);
    // refresh v7-shaped provenance from the live majority reading
    t.priceBreakdown = maj.tiers.map(c => ({ id: c.id, singular: c.singular, plural: c.plural, note: c.note, priceCents: c.priceCents, price: u(c.priceCents), minPartySize: c.min }));
    t.priceIncludesBookingFees = maj.includeFees; t.priceIncludesTaxes = maj.includeTaxes;
    t.priceEnrichmentAt = ts; t.priceSource = SOURCE; t.priceTiers = L;
    const classes = maj.tiers.map(x => ({ x, cls: classifyTier(x, t.name) }));
    const MULTI_PRODUCT = new Set([465375]);   // 'SDI/TDI Scuba Certification Courses': six different courses in one item — D-625 (same product, split by logistics) does not apply; anchoring deferred, stored tier re-verified
    if (MULTI_PRODUCT.has(t.pk)) { const keep = maj.tiers.find(x => x.singular === t.priceLabel && u(x.priceCents) === t.price); if (keep) { for (const c of classes) c.cls = (c.x === keep) ? 'base' : 'never'; } }
    rec.tiers = classes.map(c => ({ singular: c.x.singular, note: c.x.note || '', price: u(c.x.priceCents), min: c.x.min, cls: c.cls }));
    const base = classes.filter(c => c.cls === 'base').map(c => c.x); const group = classes.filter(c => c.cls === 'group').map(c => c.x);
    const anyNz = maj.tiers.some(x => x.priceCents > 0);
    if (!anyNz) {
      t.price = null; t.priceLabel = null; t.priceConfidence = 'low'; t.priceEnrichmentStatus = 'zero_price';
      t.priceBasis = `zero_price: every live tier is $0 on the majority reading (${L.map(x => x.name).join(' / ')}); ${evid}; live ${cur}`;
      Object.assign(rec, { disposition: 'zero_price', new: null }); bump('zero_price');
    } else if (cur !== 'USD') {
      const anchor = (base.length ? base : maj.tiers.filter(x => x.priceCents > 0)).reduce((a, b) => b.priceCents < a.priceCents ? b : a);
      t.currency = cur; t.price = u(anchor.priceCents); t.priceLabel = anchor.singular; t.priceConfidence = 'low'; t.priceEnrichmentStatus = `non_usd_currency:${cur}`;
      t.priceBasis = `HELD (D-620): live details.currency ${cur} ≠ site USD; true amount ${cur} ${t.price} (${anchor.singular}) stamped, unpublished; ${evid}`;
      Object.assign(rec, { disposition: 'D-620', new: t.price, currency: cur }); bump('D-620'); ladderNote(anchor.singular);
    } else if (base.length) {
      const anchor = base.reduce((a, b) => b.priceCents < a.priceCents ? b : a);
      t.currency = 'USD'; t.price = u(anchor.priceCents); t.priceLabel = anchor.singular; t.priceConfidence = 'high'; t.priceEnrichmentStatus = 'high';
      const skipped = classes.filter(c => c.cls !== 'base' && c.x.priceCents > 0).map(c => `${c.x.singular} $${u(c.x.priceCents)} [${c.cls}]`);
      t.priceBasis = `D-624 cheapest adult/base per-person tier ${anchor.singular} $${t.price}${base.length > 1 ? ` of ${base.length} base tiers (D-625)` : ''}${skipped.length ? `; not anchoring: ${skipped.join(', ')}` : ''}; ${evid}; live USD`;
      const changed = old.price !== t.price;
      Object.assign(rec, { disposition: changed ? 'repriced' : 'unchanged', new: t.price, label: anchor.singular }); bump(changed ? 'repriced' : 'unchanged'); ladderNote(anchor.singular);
    } else {
      // whole-party-only (or never-anchor-only) ladder → HELD low (D-621; no priceUnit render path)
      const nz = maj.tiers.filter(x => x.priceCents > 0);
      // stored floor never comes from an add-on/child/kit (never-branch) tier — min over group/base tiers, all non-zero only as a fallback
      const gb = classes.filter(c => (c.cls === 'group' || c.cls === 'base') && c.x.priceCents > 0).map(c => c.x);
      const floor = (gb.length ? gb : nz).reduce((a, b) => b.priceCents < a.priceCents ? b : a);
      // exact (label, price) match first; else a group/base tier at exactly the stored price (operator renamed the tier — '4 Hours' → 'Sunset on Private Yacht', 'Jet Ski' → 'Jet Ski Tour')
      const kept = maj.tiers.find(x => x.priceCents > 0 && x.singular === old.label && u(x.priceCents) === old.price)
        || gb.find(x => u(x.priceCents) === old.price);
      if (kept && kept.singular !== old.label) t.priceLabel = kept.singular;
      if (kept) {
        // WPR s49: the D-621 whole-party hold is NOT applied here — it would hide 192 currently-visible charter/jet-ski/private-tour prices and was not in the GO ruling. The stored tier is re-verified live and kept as-is; one field flip applies the hold once ruled.
        t.currency = 'USD'; t.priceEnrichmentStatus = 'high';
        t.priceBasis = `KEPT (D-621 hold pending WPR ruling): live ladder ${nz.map(x => `${x.singular} $${u(x.priceCents)}`).join(' / ')} has no standalone adult/base per-person tier; stored ${old.label} $${old.price} re-verified live and kept visible; whole-party floor $${u(floor.priceCents)} (${floor.singular}); ${evid}; live USD`;
        Object.assign(rec, { disposition: 'HELD-kept', new: t.price, label: t.priceLabel }); bump('HELD-kept'); ladderNote(t.priceLabel); summary.push(rec); continue;
      }
      t.currency = 'USD'; t.priceConfidence = 'low'; t.priceEnrichmentStatus = 'high';
      t.price = u(floor.priceCents); t.priceLabel = floor.singular;
      t.priceBasis = `HELD (${group.length ? 'D-621 whole-party' : 'no adult/base tier'}): live ladder ${nz.map(x => `${x.singular} $${u(x.priceCents)}`).join(' / ')} has no standalone adult/base per-person tier; floor $${t.price} (${floor.singular}) stamped unpublished pending priceUnit port; ${evid}; live USD`;
      Object.assign(rec, { disposition: 'HELD', new: t.price, label: floor.singular }); bump('HELD'); ladderNote(floor.singular);
    }
    summary.push(rec);
  }
  const after = doc.tours.map(t => JSON.stringify(t));
  const changedIdx = after.map((s, i) => s !== before[i] ? i : -1).filter(i => i >= 0);
  const outside = changedIdx.filter(i => !popSet.has(doc.tours[i].pk));
  if (outside.length || doc.tours.length !== before.length) { console.error('ABORT: rows outside population changed', outside.length); process.exit(4); }
  const untouchedInPop = pop.length - changedIdx.length;   // every population row gets a fresh stamp, so this must be 0
  const result = { stampedAt: ts, appliedAt, population: pop.length, rowsChanged: changedIdx.length, untouchedInPop, disposition: disp, ladders, summary };
  if (!DRY) { const patch = {}; for (const i of changedIdx) patch[doc.tours[i].pk] = doc.tours[i];
    fs.writeFileSync(`${EV}/patch.json`, JSON.stringify(patch)); fs.writeFileSync(`${EV}/apply-summary.json`, JSON.stringify(result, null, 1) + '\n'); }
  else if (process.env.DRY_OUT) fs.writeFileSync(process.env.DRY_OUT, JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify({ stampedAt: ts, population: pop.length, rowsChanged: changedIdx.length, untouchedInPop, disposition: disp, ladders, dry: DRY }));
}
if (mode === 'probe') probe(); else if (mode === 'apply') apply(); else { console.error('usage: probe|apply'); process.exit(1); }
