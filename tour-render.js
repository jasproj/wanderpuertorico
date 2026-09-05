// Shared tour-card rendering helpers.
//
// These live here, not in app.js, because TWO renderers need them and they had
// drifted: app.js renders the catalogue grid and the pinned rosters, while
// activity-loader.js renders the six activity landing pages. Duplicating the
// price/schema logic is exactly how those two templates diverged in the first
// place, so this file is the single source of truth for both.
//
// Loaded as a classic script BEFORE app.js / activity-loader.js on every page
// that uses either. No module wrapper: both consumers are classic scripts and
// read these as globals.

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPrice(price, confidence) {
    if (!Number.isFinite(price) || price <= 0) return 'Price on request';
    if (confidence === 'low') return 'Price on request';
    // Display only — the number itself is untouched, and generateTourSchema()
    // still emits the raw tour.price. Bare interpolation was rendering
    // "From $1499.99" and "From $7600": cents nobody quoted, and no thousands
    // separator on exactly the four-figure listings where the number is the
    // whole argument. Same fix as wandernewzealand #155.
    return `From $${Math.round(price).toLocaleString('en-US')}`;
}

// Pricing unit for the card badge — "per group", "whole boat · up to 4 people".
// Ported from wanderengland/app.js priceUnit() (WENG, itself verbatim from
// wanderamsterdam/app.js, WAMS #91, via keywestsandbartours / wandernewzealand #108):
// driven ONLY by the explicit _unknownFields.priceUnit string — no inference from
// priceLabel words. Empty for every row that does not carry one, so those cards
// render exactly as they did before this existed. Lives HERE rather than in app.js
// because WPR has two renderers (app.js, activity-loader.js) sharing this file.
// formatPrice() is left alone: it answers "what is the number", this answers
// "what does the number buy".
function priceUnit(tour) {
    const u = (tour._unknownFields || {}).priceUnit;
    return (typeof u === "string" && u.trim()) ? u.trim() : "";
}

function priceUnitHtml(tour) {
    const unit = priceUnit(tour);
    return unit ? `<small>${escapeHtml(unit)}</small>` : '';
}

// --- s53 schema unit gate ---------------------------------------------------
// A bare Offer.price is read as per-person by the Bing/ChatGPT/Copilot
// ecosystem -- this network's primary conversion channel -- so a whole-boat
// charter, jet-ski rental, or Spanish-language "Tour Privado" emitted bare
// misquotes a group/vehicle price as a per-head fare. Ruled s52 (network
// decision): the gate has THREE states, derived from the row's own evidence
// -- _unknownFields.priceUnit (the exact string the card renders via
// priceUnit()), priceLabel, and the anchor tier (the priceBreakdown tier
// whose price equals the emitted price). A tier note is corroborating only
// and is never read here.
//   1. per-person affirmatively asserted     -> bare Offer.price, byte-
//      identical to what shipped before this gate existed.
//   2. non-per-person affirmatively asserted -> no bare price; a
//      UnitPriceSpecification whose unitText is the VERBATIM card string
//      (priceUnit(tour), the same field priceUnitHtml() renders) -- never a
//      parallel wording. If the card renders no unit string there is nothing
//      to mirror, so no price at all.
//   3. no unit evidence either way -> no price at all. Absence of evidence is
//      not per-person; silence is honest, a guess is not.
// Every word list below is built from this pool's own vocabulary
// (_evidence/s53-wpr-schema-gate/vocab-out.txt), and every string the lists
// do not reach falls to state 3 -- ambiguity resolves toward silence. That
// includes single-occupant equipment whose label carries no textual signal
// either way (e.g. "Flyboard Session", priced per rider but not asserted as
// such in the label) — the classifier reads text, not tour.name or notes.

// Classify one evidence string: 'per-person', 'non-per-person', or '' (no
// verdict). Order matters twice: shared/semi-private formats sell seats on
// someone else's booking and must be read BEFORE the exclusivity words they
// contain ("Shared Tour", "Semi-Private Lesson"); and single-occupant
// vehicle/equipment words ("Jet Ski Driver") must be read before the
// per-person role nouns they also contain ("Driver") -- the equipment is
// never affirmatively "per person" even when exactly one person uses it.
function classifyUnitText(s) {
    if (typeof s !== 'string' || !s.trim()) return '';
    // "shared" has no trailing \b: this pool concatenates it in CamelCase
    // ("SharedTour"), and every "shared..." string found here is genuinely a
    // shared/group-per-person format (verified against vocab-out.txt).
    const SHARED_RE = /\b(?:shared|semi[-\s]?private|non[-\s]?private)/i;
    if (SHARED_RE.test(s)) return 'per-person';

    // Whole-unit evidence: exclusivity (English "private" and Spanish
    // "privado/a", this pool's Old San Juan walking-tour operators write in
    // Spanish), per-group phrasing, vessel/vehicle/equipment units, event
    // pricing, capacity counts ("1-6 People", "Up to 40 Guests", "2 People").
    const NON_PER_PERSON_RES = [
        /\bprivate\b/i,
        /\bprivad[oa]s?\b/i,
        /\bcharter(?:s|ed)?\b/i,
        /\bper[\s-]?(?:group|booking|party|boat|couple|family|vehicle|van|unit|hour)\b/i,
        /\bby the hour\b/i,
        /\bwhole\s?(?:unit|boat|vessel|group)\b/i,
        /\bgroup\s?(?:of|size|rate)\b/i,
        /^\s*group\s*$/i,
        /\bexclusive\b/i,
        /\brentals?\b/i,
        /\bpax\b/i,
        /\bcouples?\b/i,
        /\bjet[\s-]?skis?\b/i,
        /\b(?:yachts?|cabanas?|umbrellas?|coolers?|(?:e-?)?bikes?|suvs?|vans?|utvs?|buggy|buggies|mini[\s-]?boats?)\b/i,
        /\bcar\s*\/\s*truck\b/i,
        /\b(?:wedding|ceremony|proposal|burial at sea|family session)\b/i,
        /\bpackages?\b/i,
        /\d\s*(?:[-–—~]|to)\s*\d+\s*(?:people|persons?|guests?|passengers?|hikers?|anglers?|surfers?)\b/i,
        /\bup\s?to\s+\d+\s*(?:people|persons?|guests?|passengers?)\b/i,
        /\b\d+\s*(?:people|guests|passengers)\b/i,
        /\b\d+\s?(?:passenger|seater)\b/i,
        /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+to\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons?|guests?|passengers?)\b/i
    ];
    for (const re of NON_PER_PERSON_RES) {
        if (re.test(s)) return 'non-per-person';
    }

    // Per-person evidence: explicit per-X phrasing, customer-type nouns, age
    // qualifiers, and per-student formats (courses, classes, lessons, camps).
    const PER_PERSON_RES = [
        /\bper[\s-]?(?:person|adult|child|guest|passenger|participant|rider|diver|snorkeler|surfer|student|swimmer|angler|hiker|traveler|golfer)\b/i,
        /\/\s?person\b/i,
        /\b(?:adults?|child(?:ren)?|kids?|keiki|youth|infants?|seniors?|teens?|juniors?|toddlers?|persons?|people|snorkele?rs?|(?:free)?divers?|dives?|surfers?|riders?|drivers?|passengers?|participants?|guests?|students?|hikers?|anglers?|travele?rs?|visitors?|campers?|cyclists?|paddlers?|flyers?|birders?|hunters?|fisherm[ae]n|swimmers?|individuals?|attendees?|yogis?|golfers?|zippers?|seats?|admission|tickets?|pass(?:es)?|scuba|certified|kamaʻ?'?[aā]ina)\b/i,
        /\bages?\s?\d+/i,
        /\b\d+\s?(?:&|and|or)\s?(?:up|under|over|younger|older)\b/i,
        /^\s*singles?\s*$/i,
        /\b(?:courses?|class(?:es)?|certifications?|camps?|lessons?)\b/i
    ];
    for (const re of PER_PERSON_RES) {
        if (re.test(s)) return 'per-person';
    }
    return '';
}

// Combine the row's three evidence sources into one state. Any whole-unit
// assertion outranks a per-person one: the harm of a wrong bare price (a
// charter read as per-person) dwarfs the harm of a suppressed one.
function unitStateFromEvidence(tour) {
    const pb = Array.isArray(tour.priceBreakdown) ? tour.priceBreakdown : [];
    const anchor = pb.find(p => p.price === tour.price);
    const verdicts = [
        priceUnit(tour),                        // the string the card renders
        (tour.priceLabel || '').trim(),
        anchor ? (anchor.singular || '').trim() : ''
    ].map(classifyUnitText);
    if (verdicts.includes('non-per-person')) return 'non-per-person';
    if (verdicts.includes('per-person')) return 'per-person';
    return 'none';
}

function generateTourSchema(tour) {
    // The `tour.price > 0` term is deliberate and is a FIX made during the
    // extraction. Previously this gated only on Number.isFinite() and the
    // confidence flag, while formatPrice() suppresses anything <= 0. A record
    // priced at 0 therefore rendered "Price on request" while still emitting
    // an Offer of 0 — a visible price of "on request" contradicted by
    // structured data claiming the tour is free. No record carries price 0
    // today, so the defect was dormant; the two gates now agree.
    const emitPrice = Number.isFinite(tour.price)
        && tour.price > 0
        && tour.priceConfidence !== 'low';
    const state = emitPrice ? unitStateFromEvidence(tour) : 'none';
    const cardUnit = priceUnit(tour);
    return {
        "@context": "https://schema.org",
        "@type": "TouristTrip",
        "name": tour.name,
        "description": tour.description || "",
        "touristType": tour.tags ? tour.tags.join(", ") : "",
        ...(state === 'per-person' && {
            "offers": {
                "@type": "Offer",
                "price": tour.price,
                "priceCurrency": "USD",
                "url": tour.bookingUrl,
                "availability": "https://schema.org/InStock"
            }
        }),
        // unitText must mirror the visible card verbatim; a non-per-person row
        // whose card shows no unit string (or whose card string itself reads
        // per-person, a contradiction) has nothing honest to emit, so it emits
        // no price at all.
        ...(state === 'non-per-person' && cardUnit && classifyUnitText(cardUnit) !== 'per-person' && {
            "offers": {
                "@type": "Offer",
                "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": tour.price,
                    "priceCurrency": "USD",
                    "unitText": cardUnit
                },
                "url": tour.bookingUrl
            }
        }),
        "provider": {
            "@type": "LocalBusiness",
            "name": tour.company
        }
    };
}
