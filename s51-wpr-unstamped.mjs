#!/usr/bin/env node
// s51-wpr-unstamped: first-ever live stamp for the 205 legacy rows that carry NO priceEnrichmentAt
//   (s49 census: 'unstamped 205', incl. the 4 earning pks verified by hand in s49 RECON 3). Derived from
//   s49-wpr-refresh.mjs (PR #251) with the s49 unittag rules (PR #253) folded in for whole-party ladders.
//   Population: rows whose priceEnrichmentAt is absent/non-string. Re-derived in-branch at run time.
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
const FILE = 'tours-data.json';
const EV = '_evidence/s51-wpr-unstamped';
const SOURCE = 's51-wpr-unstamped';
const STAMP_DAY = '2026-08-26';
const DATES = ['2026-09-06', '2026-09-20', '2026-10-04', '2026-10-25'];
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
const inA = t => typeof t.priceEnrichmentAt !== 'string';
const pop = doc.tours.filter(inA);
console.error(`population unstamped=${pop.length} (stamped ${doc.tours.length - pop.length})`);
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
// ---- s51 overlay (calibrated on the 2026-08-26 dry run over the 205 unstamped rows; each rule cites the row that forced it) ----
const S51_NEVER = /\b(payment|pago|balance)\b/i;                                                     // 690899: a 'PAYMENT' deposit tier is not a fare
const S51_ADDON = /\b(rent|rental|gear)\b/i;                                                          // 243799: 'Dry Bag Rent' / 'Snorkeling Gear Rent' on a TOUR product are add-ons, never fares
const S51_SEAT = /\b(kayaking|kayak (tour|adventure|mini eco-experience)|bio ?bay)\b/i;              // 8754/211394/493405/10548/57220: a 'Bio Bay Night Kayaking' tier is a per-person seat (PR #253 ruling on 107727), not a kayak hire
const S51_DIVER = /\bdivers?\b/i;                                                                     // 9384: 'Night Divers' hit WENG's berth word 'nights?' — a diver is a person
const S51_VOLUME = /^\d+\s*\+\s*\w/;                                                              // 9022/9024/267659/9566: '2+ Divers' is a party-size variant; the single-diver tier anchors (s47 VOLUME-LADDER closure)
const S51_RIDER = /\badditional rider\b/i;                                                            // 9142/9140/9141/9139: Duke's sole live tier — when it is the ONLY priced tier it is the fare (sole-tier precedent 324591)
const S51_PACKAGE = /\bpackage\b/i;                                                                   // 64400/14828: 'Wave package' / 'Dolphin Package' on a charter product are whole-boat tiers, not add-ons
const S51_MENU_NAME = /\b(equipment|gear|chair|umbrella|toys|beach & dive)\b/i;                     // 37388/267754/14861: multi-item equipment MENUS (≥4 priced items) have no single product to anchor -> HELD low; a 4-tier kayak hire (471870) is NOT a menu
function classifyTier(t, productName, ladder) {
  const sing = (t.singular || '').trim(); const note = t.note || '';
  if (!(t.priceCents > 0)) return 'zero';
  const priced = (ladder || []).filter(x => x.priceCents > 0);
  if (priced.length === 1 && (S51_RIDER.test(sing) || S51_NEVER.test(sing))) return 'base';   // 9142/678954/689339/688261: the operator's ONLY priced tier is the fare, whatever it is called
  if (WPR_NEVER.test(sing) || S51_NEVER.test(sing)) return 'never';
  if (S51_VOLUME.test(sing)) return 'group';
  if (S51_ADDON.test(sing) && !S51_MENU_NAME.test(productName || '') && priced.some(x => !S51_ADDON.test(x.singular || ''))) return 'never';   // only when a non-add-on tier exists to anchor (456020/471870/491948 are pure hire ladders)
  if (S51_PACKAGE.test(sing) && (NAME_GROUP.test(productName || '') || /\b(catamaran|sailing|yacht)\b/i.test(productName || ''))) return 'group';   // 64400 'Zatara Sailing Catamaran'
  if (S51_SEAT.test(sing) && !NEVER.test(sing) && !AGE_RANGE.test(sing)) return 'base';   // 10555: 'Child El Yunque … BioBay' stays never
  if (S51_DIVER.test(sing) && !NEVER.test(sing) && !GROUP.test(sing.replace(/\bnight\b/i, ''))) return 'base';
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

// ---- s49 unittag rules (PR #253, unittag.py ported verbatim) ----
const LABEL_UNIT = /\b(private|privado|privada|charter|charters|boat|yacht|jet ?ski|jetski|sea doo|cruiser|vehicle|veh[ií]culo|cabin|utv|atv|buggy|rental|rentals|hire|group|grupo|people|persons|passengers|guests|pax|party|up to|for one|one to|1-\d|\d-\d|seater|whole|per hour|hour rental|trip •|couple|board|court|equipment|package|jetcar|kayak)\b|\d+\s*(people|persons|passengers|guests)/i;
const CAP = /(up to \d+ (people|persons|passengers|guests|pax|riders|players)|\d+\s*(-|to|–)\s*\d+ (people|persons|passengers|guests|pax)|per (boat|vehicle|group|charter|jet ?ski|kayak|cabin|utv|buggy)|private (charter|boat|tour|group|vehicle|yacht|experience)|whole boat|max(imum)? (of )?\d+ (people|passengers|guests)|capacity (of )?\d+|for \d+ people|\d+ passengers|group of \d+)/i;
const ws = s => String(s || '').split(/\s+/).join(' ').trim();
function unitFor(tier, t) {
  const L = ws(tier.singular); const note = ws(tier.note); const desc = ws(t.description);
  if (LABEL_UNIT.test(L)) return { unit: L, rule: 'tier label verbatim' };
  const m = CAP.exec(note) || CAP.exec(desc);
  if (m) return { unit: m[0], rule: `description quoted ("${m[0]}")` };
  if (CAP.test(t.name || '') || LABEL_UNIT.test(t.name || '')) return { unit: ws(t.name), rule: 'product name quoted' };
  return null;
}

function apply() {
  const ev = JSON.parse(fs.readFileSync(`${EV}/probe.json`, 'utf8'));
  if (ev.reconcile.incomplete.length) { console.error('ABORT: probe incomplete'); process.exit(5); }
  if (ev.population !== pop.length) { console.error('ABORT: population drift since probe'); process.exit(5); }
  // date-validity instrument: at least one start_at must move across dates for some row
  const moved = Object.values(ev.perPk).some(v => new Set(v.probes.filter(p => p.start_at).map(p => p.start_at)).size > 1);
  if (!moved) { console.error('ABORT: date parameter ignored (no start_at moved)'); process.exit(6); }
  const appliedAt = new Date().toISOString();
  // priceEnrichmentAt is locked to the ruling's stamp day (2026-08-25); the wall-clock apply time is recorded in the evidence bundle.
  const ts = `${STAMP_DAY}T${appliedAt.slice(11)}`;
  const before = doc.tours.map(t => JSON.stringify(t)); const popSet = new Set(pop.map(t => t.pk));
  const summary = []; const disp = {};
  const bump = k => { disp[k] = (disp[k] || 0) + 1; };
  for (const t of pop) {
    const v = ev.perPk[t.pk]; const ok = v.probes.filter(p => !p.error); const sampled = ok.filter(p => !p.absent);
    const old = { price: t.price, label: t.priceLabel, conf: t.priceConfidence };
    const rec = { pk: t.pk, name: t.name, old: old.price, oldLabel: old.label };
    const tiersOf = p => p.tiers.map(x => ({ name: x.singular, note: x.note || '', price: u(x.priceCents), minPartySize: x.min ?? null }));
    if (sampled.length === 0) {
      t.priceConfidence = 'low'; t.priceSource = SOURCE; t.priceEnrichmentAt = ts; t.priceEnrichmentStatus = ok.length ? 'unsampled' : 'probe_error';
      t.priceBasis = `UNSAMPLED: absent from price-preview items[] on ${ok.length}/${DATES.length} dated probes (${DATES.join(', ')})${ok.length < DATES.length ? `, ${DATES.length - ok.length} probe error(s)` : ''}; stored ${old.price == null ? 'null' : '$' + old.price}${old.label ? ` (${old.label})` : ''} retained unpublished pending a live reading`;
      t.priceTiers = (t.priceBreakdown || []).map(x => ({ name: x.singular, note: x.note || '', price: x.price, minPartySize: x.minPartySize ?? null }));
      Object.assign(rec, { disposition: ok.length ? 'UNSAMPLED' : 'PROBE_ERROR', new: t.price, probeErrors: v.probes.filter(p => p.error).map(p => p.error) }); bump(ok.length ? 'UNSAMPLED' : 'PROBE_ERROR'); summary.push(rec); continue;
    }
    // majority ladder across sampled readings (by non-zero tier name+price)
    const key = p => JSON.stringify(p.tiers.map(x => [x.singular, x.priceCents]));
    const counts = new Map(); for (const p of sampled) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
    const majKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]; const maj = sampled.find(p => key(p) === majKey);
    const valid = sampled.filter(p => p.dateValid).length;
    const evid = `${sampled.length}/${DATES.length} dated readings (${valid} date-valid), ${counts.size} ladder shape(s)`;
    const cur = maj.liveCurrency; const L = tiersOf(maj);
    // refresh v7-shaped provenance from the live majority reading
    t.priceBreakdown = maj.tiers.map(c => ({ id: c.id, singular: c.singular, plural: c.plural, note: c.note, priceCents: c.priceCents, price: u(c.priceCents), minPartySize: c.min }));
    t.priceIncludesBookingFees = maj.includeFees; t.priceIncludesTaxes = maj.includeTaxes;
    t.priceEnrichmentAt = ts; t.priceSource = SOURCE; t.priceTiers = L;
    const classes = maj.tiers.map(x => ({ x, cls: classifyTier(x, t.name, maj.tiers) }));
    const MULTI_PRODUCT = new Set([]);   // 465375 is in the stamped set, not here   // 'SDI/TDI Scuba Certification Courses': six different courses in one item — D-625 (same product, split by logistics) does not apply; anchoring deferred, stored tier re-verified
    if (MULTI_PRODUCT.has(t.pk)) { const keep = maj.tiers.find(x => x.singular === t.priceLabel && u(x.priceCents) === t.price); if (keep) { for (const c of classes) c.cls = (c.x === keep) ? 'base' : 'never'; } }
    // COURSE_ANCHOR (ruling 2026-08-26): 'Open Water Scuba Diver' items sell three course products on one ladder; only 'Open Water Student'
    // buys the item's own product (5 confined + 4 open-water). 'Scuba Diver' $450 is the lesser PADI Scuba Diver cert, 'UPGRADE' is its top-up,
    // '2+' tiers are party variants -> sole-audience rule: the Open Water Student tier anchors, everything else is never.
    const COURSE_ANCHOR = new Map([[9566, 'Open Water Student'], [267702, 'Open Water Student']]);
    if (COURSE_ANCHOR.has(t.pk)) { const keep = maj.tiers.find(x => x.singular === COURSE_ANCHOR.get(t.pk)); if (!keep) { console.error('ABORT: COURSE_ANCHOR tier missing', t.pk); process.exit(7); } for (const c of classes) c.cls = (c.x === keep) ? 'base' : 'never'; }
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
      Object.assign(rec, { disposition: 'D-620', new: t.price, currency: cur }); bump('D-620');
    } else if (base.length) {
      const anchor = base.reduce((a, b) => b.priceCents < a.priceCents ? b : a);
      t.currency = 'USD'; t.price = u(anchor.priceCents); t.priceLabel = anchor.singular; t.priceConfidence = 'high'; t.priceEnrichmentStatus = 'high';
      const skipped = classes.filter(c => c.cls !== 'base' && c.x.priceCents > 0).map(c => `${c.x.singular} $${u(c.x.priceCents)} [${c.cls}]`);
      t.priceBasis = `D-624 cheapest adult/base per-person tier ${anchor.singular} $${t.price}${base.length > 1 ? ` of ${base.length} base tiers (D-625)` : ''}${skipped.length ? `; not anchoring: ${skipped.join(', ')}` : ''}; ${evid}; live USD`;
      const changed = old.price !== t.price;
      Object.assign(rec, { disposition: changed ? 'repriced' : 'unchanged', new: t.price, label: anchor.singular }); bump(changed ? 'repriced' : 'unchanged');
    } else {
      // whole-party-only (or never-anchor-only) ladder → HELD low (D-621; no priceUnit render path)
      const nz = maj.tiers.filter(x => x.priceCents > 0);
      // stored floor never comes from an add-on/child/kit (never-branch) tier — min over group/base tiers, all non-zero only as a fallback
      const gb = classes.filter(c => (c.cls === 'group' || c.cls === 'base') && c.x.priceCents > 0).map(c => c.x);
      const floor = (gb.length ? gb : nz).reduce((a, b) => b.priceCents < a.priceCents ? b : a);
      // s51: whole-party-only ladder -> publish the floor WITH a unit under the s49 unittag rules (PR #253):
      //   Rule 1 tier label verbatim; Rule 2 capacity phrase quoted from the tier note or description; Rule 3 product name quoted.
      //   No unit derivable -> HELD low (D-621), floor stamped unpublished. Never-anchor-only ladders (no group tier) -> HELD low.
      const isMenu = S51_MENU_NAME.test(t.name || '') && gb.length >= 4;
      const unit = (group.length && !isMenu) ? unitFor(floor, t) : null;
      t.currency = 'USD'; t.price = u(floor.priceCents); t.priceLabel = floor.singular; t.priceEnrichmentStatus = 'high';
      const ladder = nz.map(x => `${x.singular} $${u(x.priceCents)}`).join(' / ');
      if (unit) {
        t.priceConfidence = 'high';
        t._unknownFields = { ...(t._unknownFields || {}), priceUnit: unit.unit };
        t.priceBasis = `D-621 published with unit "${unit.unit}" (rule: ${unit.rule}); live ladder ${ladder} has no standalone adult/base per-person tier; whole-party floor $${t.price} (${floor.singular}); ${evid}; live USD`;
        const changed = old.price !== t.price;
        Object.assign(rec, { disposition: changed ? 'unit-repriced' : 'unit-unchanged', new: t.price, label: floor.singular, unit: unit.unit, rule: unit.rule }); bump(changed ? 'unit-repriced' : 'unit-unchanged');
      } else {
        t.priceConfidence = 'low';
        t.priceBasis = `HELD (${isMenu ? 'rental menu: ' + gb.length + ' priced items, no single product to anchor' : group.length ? 'D-621 whole-party, no unit derivable from label/note/description/name' : 'no adult/base tier'}): live ladder ${ladder} has no standalone adult/base per-person tier; floor $${t.price} (${floor.singular}) stamped unpublished; ${evid}; live USD`;
        Object.assign(rec, { disposition: 'HELD', new: t.price, label: floor.singular }); bump('HELD');
      }
    }
    summary.push(rec);
  }
  const after = doc.tours.map(t => JSON.stringify(t));
  const changedIdx = after.map((s, i) => s !== before[i] ? i : -1).filter(i => i >= 0);
  const outside = changedIdx.filter(i => !popSet.has(doc.tours[i].pk));
  if (outside.length || doc.tours.length !== before.length) { console.error('ABORT: rows outside population changed', outside.length); process.exit(4); }
  const untouchedInPop = pop.length - changedIdx.length;   // every population row gets a fresh stamp, so this must be 0
  const result = { stampedAt: ts, appliedAt, population: pop.length, rowsChanged: changedIdx.length, untouchedInPop, disposition: disp, summary };
  if (!DRY) { const patch = {}; for (const i of changedIdx) patch[doc.tours[i].pk] = doc.tours[i];
    fs.writeFileSync(`${EV}/patch.json`, JSON.stringify(patch)); fs.writeFileSync(`${EV}/apply-summary.json`, JSON.stringify(result, null, 1) + '\n'); }
  else if (process.env.DRY_OUT) fs.writeFileSync(process.env.DRY_OUT, JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify({ stampedAt: ts, population: pop.length, rowsChanged: changedIdx.length, untouchedInPop, disposition: disp, dry: DRY }));
}
if (mode === 'probe') probe(); else if (mode === 'apply') apply(); else { console.error('usage: probe|apply'); process.exit(1); }
