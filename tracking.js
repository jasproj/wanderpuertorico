/* ============================================
   WanderPuertoRico — booking_click tracking
   ============================================
   Single source of truth for the booking_click GA4 conversion event.
   Loaded site-wide via <script src="/tracking.js" defer> in <head>.

   Wires every FareHarbor booking anchor via document-level click
   delegation — no per-anchor onclick required. Survives runtime-rendered
   anchors. Gated on href alone: a fareharbor.com href is required to fire.
   A CTA-class-only anchor never fires, regardless of class name — that
   guard used to also fire on internal nav, scroll-to-grid, and dead links
   carrying a CTA class with no FareHarbor href.

   Coexistence notes:
   - Anchors with an existing onclick="trackBookingClick(...)" are skipped
     so they do not double-fire.
   - app.js defines its own enriched trackTourBooking(tour); our window
     definition is only set if not already present.

   utm_source tagging:
   - On every FareHarbor link click, we append utm_source=wanderpuertorico
     so GA4 can attribute the booking to WPR.
   - appendUtmSource is a vendored copy of _tools/generators/source-tag.js
     (_tools PR #84, 4e73885). Inlined here instead of loaded as a
     separate <script> to avoid editing every page <head>.
*/

(function () {
    function appendUtmSource(url, slug) {
        if (typeof url !== 'string' || !url) return url;
        if (typeof slug !== 'string' || !slug) return url;
        if (url.indexOf('fareharbor.com') === -1) return url;
        if (/[?&]utm_source=/.test(url)) return url;
        var sep = url.indexOf('?') === -1 ? '?' : '&';
        return url + sep + 'utm_source=' + encodeURIComponent(slug);
    }

    var REGION_KEYWORDS = ['fajardo', 'san-juan', 'culebra', 'vieques', 'bio-bay', 'el-yunque'];

    // Returns '' when the path names more than one region. First-match ordering
    // used to pick whichever keyword sat earliest in REGION_KEYWORDS, which
    // emitted a FALSE label rather than an imprecise one: a
    // Vieques-vs-Fajardo-vs-Parguera comparison reported region='fajardo', and
    // an El Yunque guide written "from San Juan" reported region='san-juan'.
    // Nine pages match more than one keyword, six of which carry booking cards.
    // A blank is honest; a wrong region corrupts any regional grouping.
    //
    // A path matching NO keyword still returns 'puerto-rico' — that is the
    // site-level default, not an ambiguity, and it is unchanged.
    function detectRegion() {
        var path = (location && location.pathname) || '';
        var hits = [];
        for (var i = 0; i < REGION_KEYWORDS.length; i++) {
            if (path.indexOf(REGION_KEYWORDS[i]) !== -1) hits.push(REGION_KEYWORDS[i]);
        }
        if (hits.length > 1) return '';
        return hits.length === 1 ? hits[0] : 'puerto-rico';
    }

    // region is omitted from the payload entirely when detectRegion() abstains,
    // rather than sent as an empty string: GA4 would otherwise carry a real ''
    // value that groups alongside the genuine ones.
    function withRegion(payload, region) {
        if (region) payload.region = region;
        return payload;
    }

    // tour_id is derived from the pk in the anchor's own href so that one
    // product reports one value. Before this, 53 of the 185 pks reachable on
    // the live site emitted more than one tour_id and four of them emitted
    // four: pr-<pk>, a bare <pk>, an <operator>/<pk>, and the full href.
    //
    // pr-<pk> is not a new scheme. It is the catalogue's own convention: all
    // 298 non-absent `id` values in tours-data.json are exactly pr-<own pk>,
    // zero exceptions. Deriving cannot contradict hand-written markup either —
    // all 164 existing data-tour-id values contain their own href's pk, with
    // zero disagreements, and no FareHarbor href on the site lacks /items/<pk>.
    var PK_IN_HREF = /\/items\/(\d+)/;

    // Precedence:
    //   1. data-tour-id when non-empty AND already canonical for this pk
    //   2. pr-<pk> derived from the anchor's own href
    //   3. the previous chain: data-tour-id -> href -> 'unknown'
    //
    // An EMPTY data-tour-id must fall through to (2). app.js renders
    // data-tour-id="${escapeHtml(tour.id)}" and escapeHtml returns '' for a
    // missing field, so 37 of the 50 cards on the homepage grid carry an empty
    // attribute rather than none — a presence check reads those as set when
    // they are not. `attr` is normalised to '' so both cases take one path.
    function readTourId(link, href) {
        var attr = link.dataset.tourId || '';
        var m = PK_IN_HREF.exec(href);
        var canonical = m ? 'pr-' + m[1] : '';
        if (attr && attr === canonical) return attr;
        if (canonical) return canonical;
        return attr || href || 'unknown';
    }

    function readContext(link) {
        var href = link.getAttribute('href') || '';
        var name = link.dataset.tourName
            || link.textContent.replace(/[→➤➔\s]+$/, '').trim()
            || 'unknown';
        var id = readTourId(link, href);
        return { name: name, id: id, href: href };
    }

    // Exported so app.js can use the same region taxonomy instead of
    // duplicating it. detectRegion() is otherwise private to this IIFE.
    window.detectRegion = window.detectRegion || detectRegion;

    if (typeof window.trackBookingClick !== 'function') {
        window.trackBookingClick = function (tourName, tourId, region) {
            if (typeof gtag === 'undefined') return;
            gtag('event', 'booking_click', withRegion({
                event_category: 'conversion',
                event_label: tourName,
                tour_name: tourName,
                tour_id: tourId
            }, region || detectRegion()));
        };
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('a');
        if (!link) return;
        var onclickAttr = link.getAttribute('onclick') || '';
        if (onclickAttr.indexOf('trackBookingClick') !== -1) return;
        var href = link.getAttribute('href') || '';
        var isFareHarbor = href.indexOf('fareharbor.com') !== -1;
        if (!isFareHarbor) return;
        link.href = appendUtmSource(link.href, 'wanderpuertorico');
        var ctx = readContext(link);
        if (typeof gtag === 'undefined') return;
        gtag('event', 'booking_click', withRegion({
            event_category: 'conversion',
            event_label: ctx.name,
            tour_name: ctx.name,
            tour_id: ctx.id
        }, detectRegion()));
    });
})();
