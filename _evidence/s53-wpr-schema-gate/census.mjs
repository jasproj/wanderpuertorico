// s53-wpr-schema-gate: three-state census + both-directions proof.
// Runs the ORIGIN/MAIN emitter (render-main-baseline.js, byte snapshot of
// origin/main:tour-render.js) and the branch emitter (tour-render.js) side by
// side over the real emitting population, then asserts:
//   - the three states partition the pool exactly (no row in two, none in zero)
//   - every pool row emitted a bare Offer.price BEFORE (the before-picture)
//   - state 1 rows emit schema byte-identical to before
//   - state 2 rows with a card unit emit UnitPriceSpecification whose unitText
//     is the card string verbatim, and no bare Offer.price
//   - state 2 rows without a mirrorable card unit, and all state 3 rows, emit
//     no offers key at all
// Prints counts + dollar face value per state and three named fixture firings.
// usage: node census.mjs <tour-render.js> <render-main-baseline.js> <app.js> <tours-data.json>
// (render-main-baseline.js is not committed; regenerate with
//  git show origin/main:tour-render.js > _evidence/s53-wpr-schema-gate/render-main-baseline.js)
import fs from 'fs';
import vm from 'vm';

const [renderPath, basePath, appPath, dataPath] = process.argv.slice(2);

function load(path, names) {
    const src = fs.readFileSync(path, 'utf8');
    const ctx = vm.createContext({ console });
    vm.runInContext(src + `\n;globalThis.__x={${names.join(',')}};`, ctx);
    return ctx.__x;
}

const cur = load(renderPath, ['generateTourSchema', 'priceUnit', 'formatPrice', 'unitStateFromEvidence', 'classifyUnitText']);
const base = load(basePath, ['generateTourSchema', 'priceUnit', 'formatPrice']);

// Drift guard: DRAW_POOL_EXCLUDED_PKS is a local array inside app.js's
// loadTours(), not an exported symbol — assert the two literal pks this
// script hardcodes are still the ones app.js excludes.
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

// The emitting population: every row capable of ever backing a rendered card
// on this site (index.html's random draw pool, or one of the six
// activity-loader.js pages' pinned/tag-filtered rosters), restricted to rows
// whose price today's generateTourSchema() actually emits bare. See
// vocab.mjs's header comment for the full derivation.
const pool = rows.filter(t => t.status !== 'inactive' && !t.bookingDead
    && cur.formatPrice(t.price, t.priceConfidence) !== 'Price on request'
    && !EXCLUDED.includes(t.pk));
const basePool = rows.filter(t => t.status !== 'inactive' && !t.bookingDead
    && base.formatPrice(t.price, t.priceConfidence) !== 'Price on request'
    && !EXCLUDED.includes(t.pk));
if (pool.length !== basePool.length) throw new Error(`pool drift: ${pool.length} vs baseline ${basePool.length}`);

let fail = 0;
const err = (msg) => { fail++; console.error('ASSERT FAIL: ' + msg); };

const tallies = {
    'per-person': { n: 0, face: 0 },
    'non-per-person-spec': { n: 0, face: 0 },     // 2a: card unit mirrored
    'non-per-person-silent': { n: 0, face: 0 },   // 2b: no mirrorable card unit
    'none': { n: 0, face: 0 }
};
const fixtures = {};

for (const t of pool) {
    const state = cur.unitStateFromEvidence(t);

    // Partition proof: membership in exactly one of the three states.
    const membership = ['per-person', 'non-per-person', 'none'].filter(s => s === state).length;
    if (membership !== 1) err(`pk ${t.pk}: in ${membership} states`);

    const oldSchema = base.generateTourSchema(t);
    const newSchema = cur.generateTourSchema(t);
    const oldJson = JSON.stringify(oldSchema);
    const newJson = JSON.stringify(newSchema);

    // Before-picture: today every pool row emits a bare Offer.price.
    if (!oldSchema.offers || !('price' in oldSchema.offers)) err(`pk ${t.pk}: baseline emitted no bare price`);

    const cardUnit = cur.priceUnit(t);
    if (state === 'per-person') {
        tallies['per-person'].n++; tallies['per-person'].face += t.price;
        if (newJson !== oldJson) err(`pk ${t.pk}: state-1 schema not byte-identical`);
        if (!fixtures.perPerson) fixtures.perPerson = { t, oldSchema, newSchema, identical: newJson === oldJson };
    } else if (state === 'non-per-person') {
        const spec = newSchema.offers && newSchema.offers.priceSpecification;
        if (cardUnit && cur.classifyUnitText(cardUnit) !== 'per-person') {
            tallies['non-per-person-spec'].n++; tallies['non-per-person-spec'].face += t.price;
            if (!spec) err(`pk ${t.pk}: state-2a missing priceSpecification`);
            else {
                if (spec['@type'] !== 'UnitPriceSpecification') err(`pk ${t.pk}: wrong spec @type`);
                if (spec.unitText !== cardUnit) err(`pk ${t.pk}: unitText "${spec.unitText}" != card "${cardUnit}"`);
                if (spec.price !== t.price) err(`pk ${t.pk}: spec price mismatch`);
            }
            if (newSchema.offers && 'price' in newSchema.offers) err(`pk ${t.pk}: state-2a leaked bare Offer.price`);
            if (!fixtures.wholeUnit && /jet.?ski|charter|privad[oa]/i.test(cardUnit)) fixtures.wholeUnit = { t, oldSchema, newSchema };
        } else {
            tallies['non-per-person-silent'].n++; tallies['non-per-person-silent'].face += t.price;
            if (newJson.includes('"offers"')) err(`pk ${t.pk}: state-2b emitted offers`);
        }
    } else {
        tallies.none.n++; tallies.none.face += t.price;
        if (newJson.includes('"offers"')) err(`pk ${t.pk}: state-3 emitted offers`);
        if (!fixtures.noEvidence) fixtures.noEvidence = { t, oldSchema, newSchema };
    }
}

const s2n = tallies['non-per-person-spec'].n + tallies['non-per-person-silent'].n;
const s2face = tallies['non-per-person-spec'].face + tallies['non-per-person-silent'].face;
const total = tallies['per-person'].n + s2n + tallies.none.n;
if (total !== pool.length) err(`partition sum ${total} != pool ${pool.length}`);

const money = (x) => '$' + x.toLocaleString('en-US');
console.log(`pool (emitting population): ${pool.length} of ${rows.length} rows; baseline emitted a bare Offer.price on all ${pool.length}`);
console.log('');
console.log('state 1 per-person asserted      :', tallies['per-person'].n, 'rows, face', money(tallies['per-person'].face), '-> bare Offer.price, byte-identical');
console.log('state 2 non-per-person asserted  :', s2n, 'rows, face', money(s2face));
console.log('  2a card unit mirrored          :', tallies['non-per-person-spec'].n, 'rows, face', money(tallies['non-per-person-spec'].face), '-> UnitPriceSpecification, unitText = card string verbatim');
console.log('  2b no mirrorable card unit     :', tallies['non-per-person-silent'].n, 'rows, face', money(tallies['non-per-person-silent'].face), '-> no price emitted');
console.log('state 3 no unit evidence         :', tallies.none.n, 'rows, face', money(tallies.none.face), '-> no price emitted');
console.log('');
console.log(`cross-check vs the s52 cross-site audit (~125 non-per-person rows / ~$183,038 face): this census finds ${s2n} / ${money(s2face)}. Broader for the same reason as the WHAW reference (#263): the pool's own vocabulary also surfaces jet-ski/UTV/buggy rentals and Spanish "Tour Privado" listings the audit's word list didn't carry — every extra row errs toward silence, never toward a bare price.`);

// Per-state evidence-string tallies so a wrong verdict is visible by eye: for
// each row, the string that decided its state (first source returning the
// state's verdict), or the priceLabel/anchor for state-3 rows.
const deciders = { 'per-person': new Map(), 'non-per-person': new Map(), none: new Map() };
for (const t of pool) {
    const state = cur.unitStateFromEvidence(t);
    const pb = Array.isArray(t.priceBreakdown) ? t.priceBreakdown : [];
    const anchor = pb.find(p => p.price === t.price);
    const sources = [cur.priceUnit(t), (t.priceLabel || '').trim(), anchor ? (anchor.singular || '').trim() : ''];
    const key = state === 'none'
        ? (sources[1] || sources[2] || '<empty>')
        : sources.find(s => cur.classifyUnitText(s) === state);
    deciders[state].set(key, (deciders[state].get(key) || 0) + 1);
}
for (const [state, m] of Object.entries(deciders)) {
    console.log(`\n== deciding evidence strings, state ${state} (${m.size} distinct) ==`);
    [...m.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`${String(n).padStart(5)}  ${k}`));
}

for (const [name, fx] of Object.entries(fixtures)) {
    console.log(`\n=== fixture: ${name} — pk ${fx.t.pk} "${fx.t.name}" price $${fx.t.price} ===`);
    console.log('  evidence: priceUnit=' + JSON.stringify(cur.priceUnit(fx.t)) + ' priceLabel=' + JSON.stringify(fx.t.priceLabel ?? null)
        + ' anchorSingular=' + JSON.stringify((Array.isArray(fx.t.priceBreakdown) ? fx.t.priceBreakdown : []).find(p => p.price === fx.t.price)?.singular ?? null));
    console.log('  before offers:', JSON.stringify(fx.oldSchema.offers ?? null));
    console.log('  after  offers:', JSON.stringify(fx.newSchema.offers ?? null));
    if ('identical' in fx) console.log('  full schema byte-identical to baseline:', fx.identical);
}

if (fail) { console.error(`\n${fail} assertion failure(s)`); process.exit(1); }
console.log('\nall assertions passed: partition exact, state-1 byte-identical, state-2a verbatim card unitText + no bare price, state-2b/3 no price key');
