// WanderPuertoRico Tours App
// Load tours from JSON and render with descriptions

let toursData = [];

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
        region: tour.region,
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

function generateTourSchema(tour) {
    const emitPrice = Number.isFinite(tour.price) && tour.priceConfidence !== 'low';
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
                <img src="${tour.image}" alt="${escapeHtml(tour.name)}" loading="lazy" width="400" height="300" onerror="this.src='https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400'" style="width: 100%; height: auto; object-fit: cover;">
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

// Load and display tours
async function loadTours() {
    try {
        const response = await fetch('tours-data.json');
        const _raw = await response.json();
        toursData = Array.isArray(_raw) ? _raw : _raw.tours;

        const shuffled = shuffleArray(toursData).slice(0, 50);
        preCacheBookingUrls(shuffled);
        
        const grid = document.getElementById('tours-grid');
        if (grid) {
            grid.innerHTML = shuffled.map(tour => createTourCard(tour)).join('');
            attachBookingHandler(grid);
        }
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
