// WanderPuertoRico Tours App
// Load tours from JSON and render with descriptions

let toursData = [];

// Wire the homepage "Verified Tours" stat to the live (non-dead) catalog
// size, replacing the hardcoded value. No-op on pages without the element.
function updateVerifiedToursCount(n) {
    const el = document.getElementById('verified-tours-count');
    if (el) el.textContent = Number(n).toLocaleString();
}

// ===== BOOKING PERFORMANCE OPTIMIZATIONS =====

// 1. URL Caching - Pre-cache FareHarbor URLs for instant clicks
const bookingUrlCache = {};

function cacheBookingUrl(tourId, url) {
    bookingUrlCache[tourId] = {
        url: url,
        cached_at: Date.now()
    };
    try {
        localStorage.setItem('fh_cache_' + tourId, JSON.stringify(bookingUrlCache[tourId]));
    } catch (e) {
        // localStorage full - continue without persistence
    }
}

function getBookingUrl(tourId, fallbackUrl) {
    const cached = bookingUrlCache[tourId];
    if (cached && Date.now() - cached.cached_at < 3600000) {
        return cached.url;
    }
    return fallbackUrl;
}

function preCacheBookingUrls(tours) {
    tours.forEach(tour => {
        if (tour.bookingUrl) {
            cacheBookingUrl(tour.id || tour.name, tour.bookingUrl);
        }
    });
}

// 2. GA4 Tracking Functions
// NOTE: Renamed from trackBookingClick to avoid shadowing the canonical
// 3-string global (defined in index.html <head> and /tracking.js). This
// enriched form fires on tour-grid clicks where company/price are known.
function trackTourBooking(tour) {
    gtag('event', 'booking_click', {
        tour_id: tour.id,
        tour_name: tour.name,
        // detectRegion() is exported by tracking.js; guard in case load
        // order ever changes so this can never throw and kill the event.
        region: (typeof window.detectRegion === 'function' ? window.detectRegion() : undefined),
        price: tour.price || 'unknown',
        company: tour.company,
        event_category: 'conversion'
    });
}

function trackFilterChange(filterType, value) {
    gtag('event', 'filter_used', {
        filter_type: filterType,
        value: value,
        event_category: 'engagement'
    });
}

function trackSearchUsed(searchTerm) {
    gtag('event', 'search_used', {
        query: searchTerm,
        event_category: 'engagement'
    });
}

function trackLoadMoreClick() {
    gtag('event', 'load_more_clicked', {
        event_category: 'engagement'
    });
}

// 3. Loading indicator with optimization
function openBookingWithLoader(url, tour) {
    event && event.preventDefault && event.preventDefault();
    
    // Track the booking click
    if (tour) {
        trackTourBooking(tour);
    }
    
    const loader = document.createElement('div');
    loader.id = 'booking-loader';
    loader.className = 'booking-loader';
    loader.innerHTML = `
        <div class="booking-loader-content">
            <div class="spinner"></div>
            <p>Opening booking...</p>
        </div>
    `;
    document.body.appendChild(loader);
    
    setTimeout(() => {
        window.open(url, '_blank');
        loader.remove();
    }, 300);
}

// Helper functions


// attachBookingHandler used to wire a delegated click handler that
// called openBookingWithLoader. That was a workaround for the previous
// <button> markup, which couldn't navigate natively. Tour cards now
// render as <a href target="_blank"> and navigate on their own. Kept
// as a no-op so any old call sites don't throw.
function attachBookingHandler(grid) { /* no-op (anchor navigates natively) */ }

function cleanLocation(location = '') {
    return location
        .replace(/^Puerto Rico\//, '')
        .trim() || 'Puerto Rico';
}

function scoreLabel(score) {
    if (score >= 90) return 'Top Rated';
    if (score >= 75) return 'Popular';
    return '';
}


// Applied at render time, not just via onerror: 16 records have no image
// field, and `src="undefined"` costs a real 404 before onerror can rescue it.
const FALLBACK_IMAGE = '/images/hero-photo-1.jpg';

// Fisher-Yates shuffle (non-mutating)
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Create tour card HTML
function createTourCard(tour) {
    const tags = tour.tags || [];
    const tagDisplay = tags.slice(0, 3).map(tag =>
        `<span class="tour-tag">${escapeHtml(tag)}</span>`
    ).join(' ');

    const description = tour.description || '';
    const safeDesc = description.replace(/\s+/g, ' ').trim();
    const truncatedDesc = safeDesc.length > 120
        ? safeDesc.substring(0, safeDesc.lastIndexOf(' ', 117)) + '…'
        : safeDesc;

    const score = tour.qualityScore || 0;
    const badge = scoreLabel(score);
    const qualityBadge = badge
        ? `<span class="quality-badge">⭐ ${badge}</span>`
        : '';

    const cleanLoc = cleanLocation(tour.location);
    const priceDisplay = formatPrice(tour.price, tour.priceConfidence);

    const schema = generateTourSchema(tour);
    const schemaJson = JSON.stringify(schema).replace(/<\/script/gi, '<\\/script');

    let badgesHtml = '<div class="tour-badges">';
    if (tour.freeCancellation) {
        badgesHtml += '<span class="trust-badge free-cancel">Free Cancellation</span>';
    }
    badgesHtml += '</div>';

    return `
        <article class="tour-card" data-id="${tour.id}">
            <script type="application/ld+json">${schemaJson}</script>
            <div class="tour-image">
                <img src="${tour.image || FALLBACK_IMAGE}" alt="${escapeHtml(tour.name)}" loading="lazy" width="400" height="300" onerror="this.src='${FALLBACK_IMAGE}'" style="width: 100%; height: auto; object-fit: cover;">
                ${qualityBadge}
            </div>
            <div class="tour-content">
                <div class="tour-meta">
                    <span class="tour-location">📍 ${escapeHtml(cleanLoc)}</span>
                </div>
                <h3 class="tour-title">${escapeHtml(tour.name)}</h3>
                <p class="tour-description">${escapeHtml(truncatedDesc)}</p>
                <div class="tour-tags">${tagDisplay}</div>
                ${badgesHtml}
                <div class="tour-footer">
                    <div class="tour-price">${priceDisplay}</div>
                    <a href="${tour.bookingUrl}" target="_blank" rel="noopener" class="tour-book-btn book-now-btn" data-tour-id="${escapeHtml(tour.id)}" data-tour-name="${escapeHtml(tour.name)}" style="text-decoration: none;">Check Availability →</a>
                </div>
            </div>
        </article>
    `;
}

// Render an explicit, ordered pk roster for a curated page.
//
// A pin that cannot be rendered is reported LOUDLY and leaves a visible gap. It
// is never backfilled from the catalogue: a silent backfill is exactly the
// defect this replaces (a "Bioluminescent Bay Kayaking" page quietly serving an
// ATV tour in Patillas because one pinned pk went inactive).
function renderPinnedRoster(grid, pinnedEl, allRecords) {
    let pinnedPks;
    try {
        pinnedPks = JSON.parse(pinnedEl.textContent || '[]');
    } catch (err) {
        console.error('[pinned-roster] #activity-pinned-pks is not valid JSON:', err);
        grid.innerHTML = '<p class="pinned-roster-error">Tour roster could not be read.</p>';
        return;
    }
    if (!Array.isArray(pinnedPks) || pinnedPks.length === 0) {
        console.error('[pinned-roster] #activity-pinned-pks is present but empty — refusing to fall back to the shuffle.');
        grid.innerHTML = '<p class="pinned-roster-error">Tour roster is empty.</p>';
        return;
    }

    const livePk = new Map(toursData.map(t => [t.pk, t]));
    const anyPk = new Map(allRecords.map(t => [t.pk, t]));

    const html = [];
    const rendered = [];
    pinnedPks.forEach(pk => {
        const tour = livePk.get(pk);
        if (tour) {
            rendered.push(tour);
            html.push(createTourCard(tour));
            return;
        }
        const raw = anyPk.get(pk);
        const why = !raw ? 'not present in tours-data.json'
            : raw.status === 'inactive' ? 'status=inactive'
            : raw.bookingDead ? 'bookingDead=true'
            : 'unrenderable for an unknown reason';
        console.error('[pinned-roster] pk ' + pk + ' cannot be rendered (' + why +
                      ') — leaving a gap, NOT backfilling from the catalogue.');
        html.push('<div class="tour-card pinned-roster-missing" data-missing-pk="' + pk + '">' +
                  '<p>This tour is temporarily unavailable.</p></div>');
    });

    preCacheBookingUrls(rendered);
    grid.innerHTML = html.join('');
    attachBookingHandler(grid);
}

// Load and display tours
async function loadTours() {
    // Nothing to render and nothing to count without a grid, so skip the
    // fetch entirely -- app.js is also loaded by ~30 gridless blog pages.
    const grid = document.getElementById('tours-grid');
    if (!grid) return;
    try {
        // Absolute: a relative path resolved against the page directory and
        // 404'd on every subdirectory page (bio-bay/, culebra/, ...).
        const response = await fetch('/tours-data.json');
        const _raw = await response.json();
        const allRecords = Array.isArray(_raw) ? _raw : _raw.tours;
        toursData = allRecords.filter(t => t.status !== 'inactive' && !t.bookingDead);
        updateVerifiedToursCount(toursData.length);

        // A curated page declares an explicit pk roster. When one is present we
        // render EXACTLY that roster, in declared order, and return before the
        // shuffle -- a topic page must never serve a random cross-section of the
        // catalogue. Pages without the element are completely unaffected.
        const pinnedEl = document.getElementById('activity-pinned-pks');
        if (pinnedEl) {
            renderPinnedRoster(grid, pinnedEl, allRecords);
            return;
        }

        const shuffled = shuffleArray(toursData).slice(0, 50);
        preCacheBookingUrls(shuffled);

        grid.innerHTML = shuffled.map(tour => createTourCard(tour)).join('');
        attachBookingHandler(grid);
    } catch (error) {
        console.error('Error loading tours:', error);
    }
}

// Filter and search
function filterTours() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const activityFilter = document.getElementById('activity-filter')?.value || 'all';
    const sortBy = document.getElementById('sort-filter')?.value || 'featured';
    
    // Track filter usage
    if (searchTerm) trackSearchUsed(searchTerm);
    if (activityFilter !== 'all') trackFilterChange('activity', activityFilter);
    if (sortBy !== 'featured') trackFilterChange('sort', sortBy);
    
    let filtered = toursData;
    
    if (searchTerm) {
        filtered = filtered.filter(t => 
            t.name.toLowerCase().includes(searchTerm) ||
            (t.description || '').toLowerCase().includes(searchTerm) ||
            (t.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }
    
    if (activityFilter !== 'all') {
        filtered = filtered.filter(t => 
            (t.tags || []).includes(activityFilter)
        );
    }
    
    if (sortBy === 'price-low') {
        filtered = [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === 'price-high') {
        filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === 'rating') {
        filtered = [...filtered].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    } else {
        // 'featured' — randomize per page-load for fair rotation
        filtered = shuffleArray(filtered);
    }

    const grid = document.getElementById('tours-grid');
    if (grid) {
        grid.innerHTML = filtered.slice(0, 50).map(tour => createTourCard(tour)).join('');
        attachBookingHandler(grid);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTours();
    
    document.getElementById('activity-filter')?.addEventListener('change', filterTours);
    document.getElementById('sort-filter')?.addEventListener('change', filterTours);
    
    let searchTimeout;
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(filterTours, 300);
    });
});

// ===== STICKY MOBILE CTA BAR =====
document.addEventListener('DOMContentLoaded', () => {
    const stickyBar = document.getElementById('sticky-cta-bar');
    if (!stickyBar) return;
    
    const heroSection = document.querySelector('.hero') || document.querySelector('.tours-section');
    let heroScrolled = false;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY > (heroSection?.offsetHeight || 300);
        
        if (scrolled && !heroScrolled) {
            stickyBar.classList.add('visible');
            heroScrolled = true;
        } else if (!scrolled && heroScrolled) {
            stickyBar.classList.remove('visible');
            heroScrolled = false;
        }
    });
    
    const ctaButton = stickyBar.querySelector('button');
    if (ctaButton) {
        ctaButton.addEventListener('click', () => {
            const toursGrid = document.getElementById('tours-grid');
            if (toursGrid) {
                toursGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
});

// Mobile hamburger menu — wires .mobile-menu-btn to toggle .nav-mobile.active.
// Single source-of-truth handler for every page that loads app.js.
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-mobile');
    if (!btn || !nav) return;

    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'nav-mobile');
    nav.id = nav.id || 'nav-mobile';

    const setOpen = (open) => {
        nav.classList.toggle('active', open);
        btn.setAttribute('aria-expanded', String(open));
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(!nav.classList.contains('active'));
    });

    nav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('active')) setOpen(false);
    });
});
