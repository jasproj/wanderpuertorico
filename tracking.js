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
    /* HOSTNAME GUARD — booking_click is emitted from the live domain only.
       ------------------------------------------------------------------
       Measured 2026-08-18 across the network: 84 of 1,066 booking_click
       events came from 127.0.0.1 — local preview servers and Playwright
       runs, not users. This property recorded 0 localhost booking_click to date; the guard is preventive, and 8% of its 90-day sessions were localhost.

       EXACT hostname match, never a heuristic. www 301s to the bare host on
       all nine domains, so location.hostname is always the bare form at
       execution time; the www form is accepted anyway so a future DNS or
       Pages change cannot silently zero conversions.

       Installed as a gtag wrapper rather than a return at each call site
       because this repo emits booking_click from 5 call site(s) across
       4 file(s). Guarding only this file would leave the other emitters
       live and the localhost traffic would simply move to them. Every page
       carrying an inline emitter loads this file, and the inline
       `function gtag()` is defined in <head> before this deferred script
       runs, so the wrapper is installed before any click can fire.

       Only booking_click is suppressed. page_view and every other event are
       passed through untouched, so local QA still renders and reports
       normally — this removes a false conversion, not the tag. */
    var BOOKING_CLICK_ALLOWED_HOSTS = ['wanderpuertorico.com', 'www.wanderpuertorico.com'];
    function bookingClickHostIsLive() {
        return BOOKING_CLICK_ALLOWED_HOSTS.indexOf(location.hostname) !== -1;
    }
    if (!bookingClickHostIsLive()) {
        var _realGtagForGuard = (typeof window.gtag === 'function') ? window.gtag : null;
        window.gtag = function () {
            if (arguments[0] === 'event' && arguments[1] === 'booking_click') return;
            if (_realGtagForGuard) return _realGtagForGuard.apply(this, arguments);
            (window.dataLayer = window.dataLayer || []).push(arguments);
        };
    }

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

    // ---- tour_municipality -------------------------------------------------
    //
    // The municipality of the tour operator's departure point, from
    // tours-data.json's `location` field, keyed by the pk already present in
    // every FareHarbor href. region is a PAGE value derived from the pathname,
    // so it is constant across every card; this is the first per-CARD
    // geography the event has carried.
    //
    // It is a MUNICIPALITY, not a bay. La Parguera tours read "Lajas",
    // Fajardo tours read "Fajardo", Vieques tours read "Vieques". It is also
    // DEPARTURE-based, so a Vieques trip leaving from Fajardo reads "Fajardo" —
    // pk 569986 "VIEQUES Bioluminescence Bay" is the known case. The GA4
    // dimension description must carry both caveats.
    //
    // Inverted {municipality: [pk, ...]} rather than flat {pk: municipality}:
    // 8,520 bytes raw / 4,024 gzipped, against 22,603 / 5,566 for the flat
    // form. Inlined rather than fetched because a click is a navigation and any
    // async source can lose the race, and rather than shipped as a separate
    // file because tracking.js is already cached sitewide, so a second file
    // buys only a second request.
    //
    // The table covers ALL 1167 catalogue pks, not the ~190 currently linked.
    // index.html renders shuffleArray(toursData).slice(0, 50) — a random 50 of
    // 1167 per load — so any pk in the catalogue is clickable there and a
    // subset would silently emit nothing for the rest.
    //
    // Rincón appears once. The catalogue used to carry both "Rincón" (24) and
    // "Rincon" (36) for one municipality; this table encodes the normalised
    // form, so it is correct whether or not the tours-data.json fix has landed.
    var MUNICIPALITY_PKS = {
        "Aguada": [717149,717155,717338,717343],
        "Aguadilla": [16306,16314,17489,91727,91737,267439,267463,267467,267470,267659,267670,267702,267706,267708,267741,267751,267754,267780,267782,267790,389627,436461,447602,460058,460670,472549,487312,514001,530210,551207,564180,570033,570040,588035,590151,619968,620020,624494,628872,628873,637393,639211,639214,640481,641067,641082,645043,645089,647430,684098,723996,723997,723999,724000,724001,724004,724005,724006,724007,724008,724009,724010,724011,724012,731589],
        "Aguas Buenas": [283316,346240,378420],
        "Arecibo": [405755,543240],
        "Bayamón": [569549,698794,699001],
        "Cabo Rojo": [9142,697734,697753],
        "Caguas": [13408,45125,373318,373321,434441,549978,698795,699018],
        "Carolina": [2852,3721,10548,10555,10563,10619,10702,10765,12359,13894,14810,36464,55573,59282,183730,214905,343122,343131,343132,343133,365552,374024,374041,409312,409376,409381,409386,409387,409389,421145,421942,423707,424059,424640,428431,436525,440656,448967,448979,448982,448989,449005,475692,475700,475708,497069,497498,497512,500140,501338,528770,529449,532524,557592,582801,582803,582807,605037,615134,615138,640354,652151,664448,665533,669334,669386,673108,673119,682180,687262,695668,710141,711080,712907,713156,713158,724688,732678,732679,734116,734120],
        "Ceiba": [3727,11825,34365,39989,91370,486767,486774,487640,508424,661987,666549],
        "Corozal": [483931,542142,562436,709044,723572],
        "Culebra": [169758,169766,191576,567574,567588,567594,567598],
        "Dorado": [59694,59699,59701,59703,59705,59706,59709,60064,60660,60676,84137,86204,87072,93225,97666,118848,158294,158296,281473,281475,281478,281479,296375,298162,305227,310746,321449,321717,321720,321722,322542,322560,452544,452552,479117,490396,494607,499753,509391,522823,540447,547806,567569,574975],
        "Fajardo": [1947,2228,2231,3482,3728,3729,3730,4287,4288,5924,6068,6350,6352,6851,6894,7609,8752,8754,9090,10347,10348,11151,14828,14861,15829,15832,19383,19384,19388,23309,34807,34808,34811,35078,37548,37549,40377,40516,45148,46006,51179,57220,57279,64400,71571,72460,72467,85556,103424,105587,107727,111848,111855,114054,118714,144322,168561,194354,194415,211394,215093,230182,233090,233206,233231,233264,233266,233268,236627,247578,250737,250873,250880,250882,250891,250897,260718,271047,276931,277423,285616,293820,296512,296583,296838,299430,300252,318628,320063,324591,325006,326433,333614,333618,333653,333661,333910,343864,343865,343915,371460,375753,375766,375777,378127,378841,380406,384654,384898,385744,392110,398520,398523,398526,398528,398533,399220,399238,417502,420774,421033,421034,421035,421036,421037,423947,433326,433832,436884,442479,444716,448580,448978,448998,449012,449018,449023,451146,452538,452571,452582,452597,453578,453614,453621,468193,471811,471849,471862,476445,489720,490276,493405,494986,495899,495916,497507,497508,498298,501300,501342,501360,501489,501529,502615,506795,507219,516315,519245,519855,523164,530335,531512,541188,542101,542102,542103,542104,542105,542107,542108,542109,542110,542111,545322,555512,563467,564302,567810,569986,580877,589474,589531,591261,592306,594823,598183,598438,598814,605837,606001,606023,606026,606028,606029,606031,611976,612043,612045,617338,624530,625229,625268,628683,637225,647411,647418,649665,661938,662696,662697,662729,668325,673215,673741,673750,673761,673762,678230,687577,688261,689339,689787,690863,690899,692613,692798,695753,700436,701387,702725,703699,705169,706509,707738,712331,718722,723570,726271,727573],
        "Guaynabo": [363625,363656,363699,363718,363988,491256,491259,491923,555919,555926,627785,646045,646489,684173],
        "Guánica": [24365,24367],
        "Humacao": [15479,122042,122047,123752,471870,566226,566240,566241,566242,566243,566244],
        "Isabela": [126557,229669,373888,408310,408333,464115,516978,539219,539226,539230,541043,589677,641330,641335,641341,641349,641595,641601,641608,641615,641616,641617,645807,645808,645812,674321],
        "Lajas": [48968,48971,101308,123311,190809,215903,215908,218556,240215,240530,243766,243799,265269,286798,290229,290233,290234,290380,290385,290390,290396,290400,322409,384443,390143,402812,512325,582213,640648,656687,683572,700587,700593,700599],
        "Las Piedras": [502416],
        "Loíza": [245334,321402,321410,321415,325171,540715,540719,540720,540722,540724,673110],
        "Luquillo": [2977,43861,43862,101024,170689,349262,358211,491474,491476,511528,552005,564467,565030,567601,567604,567607,567610,567612,567615,567616,567617,630890,662906,662949,662983,667242,672496,672502,672509,672510,672513,672772,675654,675663,675672,675680,677253,677293,677329,688902,695202],
        "Manatí": [324205,324210],
        "Mayagüez": [575709,575723,575724,575725,612447],
        "Naguabo": [170688,519322,519427,519439,519441,519444,592891,592903,592918],
        "Orocovis": [187311,727603],
        "Patillas": [261634,261706,261720,261728,261731,261733,261736,261740,261744,261747,261844,261847,281668,382000,382732,382736,382738,382745,382753,382755,382775,382777,383009,383020,383022,383040,383041,383050,386722,554738],
        "Ponce": [178056,178084,562017,566125,665973,665977,665981],
        "Puerto Rico": [11821,11823,94000,625222,678954],
        "Rincón": [9020,9022,9024,9135,9136,9137,9139,9140,9141,9384,9566,9567,37388,51303,51392,51779,93734,106116,106342,151927,151941,178350,333650,333652,388922,400971,434725,465007,465016,465027,465033,465116,465147,465354,465375,465408,489352,489367,494998,495016,495062,495069,497003,497007,497009,497011,497963,513419,530852,556342,570041,597127,610301,610304,612007,651218,655016,671584,671586,671596],
        "Río Grande": [17001,34757,344713,349850,381060,383857,500377,580007,580026,580028,582211,588176,588179,633899,633949,692397],
        "Salinas": [368915,683093],
        "San Juan": [5562,9117,11463,11467,11468,12573,15373,15923,19746,29154,34479,34540,36719,36895,36900,39083,39093,39095,39097,39518,39586,43335,46134,49018,73055,73059,73063,73065,86696,87547,88646,92476,92873,95873,96928,106812,122507,128822,141073,156678,156684,156696,160105,163284,163695,168223,168224,170760,171685,183764,189838,189840,192691,196024,203932,203935,204006,209168,209612,211937,212262,218088,223183,223990,224863,230165,230208,232794,240862,240871,245289,245319,245321,245324,245327,245330,245333,246677,255294,261302,269072,269855,278513,282503,286200,286814,290742,295642,299005,304244,321376,325342,325348,327098,333095,333780,333891,334168,334203,334320,334369,334377,334384,334385,334389,334406,334414,335648,337275,339066,339205,340077,341892,344702,350686,354456,357779,369328,375780,381576,389718,397836,399774,401797,406878,411798,412341,415627,416374,422219,426343,426346,426351,426352,427346,427532,427540,427549,431379,435284,435296,435303,435305,435310,435316,435317,435324,438884,440906,443704,449138,451296,453543,455845,456020,456027,456048,457265,457280,457468,457478,457489,461485,468043,471701,472940,484249,484258,484269,484521,485023,485024,485725,485743,489225,491948,494965,499590,500627,502037,503850,507513,507516,507518,507901,508692,512075,517981,519875,520924,521000,521940,521988,521995,522073,523421,523425,525917,543763,546714,548253,549464,551117,551275,553335,558442,558447,558454,558457,558779,562497,562885,562888,562890,562903,562911,563341,567854,567863,569373,569623,570393,577957,579070,587749,589276,593957,593962,595043,595108,596221,596536,596825,605975,608334,608360,610566,610584,610585,610594,610695,611878,615988,625219,636083,636159,636353,639202,640901,645674,645917,646085,649014,649631,649637,651601,660806,661480,666534,666799,672118,675098,676029,677185,678289,678313,679654,680891,682615,683827,685347,686180,688714,690050,692709,693813,695666,695667,698431,698475,698776,698781,698786,698945,698989,698991,698998,699246,699657,699718,703031,705385,710967,712746,712911,713096,713674,713975,715092,715093,716758,717467,717678,718572,718582,718584,723937,724990,726494,730813,730828,730833,731849],
        "San Lorenzo": [698804],
        "San Sebastián": [460889,629657],
        "Santa Isabel": [502880,579976],
        "Toa Baja": [180567,365550,387908,387915,387917,482443,483232,483233,483249,483256,619270,619274,619276],
        "Trujillo Alto": [698802,698836,698848,699021,699027,699031],
        "Utuado": [2242,28789,303312,622754],
        "Vega Alta": [342712,342718,342725,342727,416623,421212,495636],
        "Vega Baja": [573780,581458,581536,581595,581659,585868,589134],
        "Vieques": [43872,43881,60000,60006,117087,118202,125134,280256,283526,283543,283563,284207,339985,343533,402641,473669,487037,487072,496120,496287,496299,517503,517531,519492,521081,522793,532390,532395,532397,586640,594708,594714,612733,612738,618413,626095,626828,632566,632567,678878,689305,694170,696755,699662,699687,704729,709075,728285]
    };

    // Built lazily on first click: 1167 entries is trivial to invert but there
    // is no reason to allocate it on a page load that never books.
    var pkToMunicipality = null;
    var PK_FOR_MUNICIPALITY = /(?:\/items\/|^pr-)(\d+)/;

    function municipalityFor(value) {
        var m = PK_FOR_MUNICIPALITY.exec(value || '');
        if (!m) return '';
        if (!pkToMunicipality) {
            pkToMunicipality = {};
            for (var name in MUNICIPALITY_PKS) {
                if (!Object.prototype.hasOwnProperty.call(MUNICIPALITY_PKS, name)) continue;
                var list = MUNICIPALITY_PKS[name];
                for (var i = 0; i < list.length; i++) pkToMunicipality[list[i]] = name;
            }
        }
        return pkToMunicipality[m[1]] || '';
    }

    // Omitted when unresolved, for the same reason region is: an empty string
    // is a real GA4 value that would group alongside the genuine ones.
    function withMunicipality(payload, value) {
        var muni = municipalityFor(value);
        if (muni) payload.tour_municipality = muni;
        return payload;
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
            gtag('event', 'booking_click', withMunicipality(withRegion({
                event_category: 'conversion',
                event_label: tourName,
                tour_name: tourName,
                tour_id: tourId
            }, region || detectRegion()), tourId));
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
        gtag('event', 'booking_click', withMunicipality(withRegion({
            event_category: 'conversion',
            event_label: ctx.name,
            tour_name: ctx.name,
            tour_id: ctx.id
        }, detectRegion()), ctx.href));
    });
})();
