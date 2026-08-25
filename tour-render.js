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
    return `From $${price}`;
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
    return {
        "@context": "https://schema.org",
        "@type": "TouristTrip",
        "name": tour.name,
        "description": tour.description || "",
        "touristType": tour.tags ? tour.tags.join(", ") : "",
        ...(emitPrice && {
            "offers": {
                "@type": "Offer",
                "price": tour.price,
                "priceCurrency": "USD",
                "url": tour.bookingUrl,
                "availability": "https://schema.org/InStock"
            }
        }),
        "provider": {
            "@type": "LocalBusiness",
            "name": tour.company
        }
    };
}
