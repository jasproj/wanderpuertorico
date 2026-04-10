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
        if (tour.bookingLink) {
            cacheBookingUrl(tour.id || tour.name, tour.bookingLink);
        }
    });
}

// 2. Loading indicator with optimization
function openBookingWithLoader(url) {
    event && event.preventDefault && event.preventDefault();
    
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
function formatPrice(price) {
    return Number.isFinite(price) ? `From $${price}` : 'Check live price';
}

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
    return {
        "@context": "https://schema.org",
        "@type": "TouristTrip",
        "name": tour.name,
        "description": tour.description || "",
        "touristType": tour.tags ? tour.tags.join(", ") : "",
        "offers": {
            "@type": "Offer",
            "price": tour.price || "",
            "priceCurrency": "USD",
            "url": tour.bookingLink,
            "availability": "https://schema.org/InStock"
        },
        "provider": {
            "@type": "LocalBusiness",
            "name": tour.company
        }
    };
}

// Fisher-Yates shuffle
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Create tour card HTML
function createTourCard(tour) {
    const tags = tour.tags || [];
    const tagDisplay = tags.slice(0, 3).map(tag => 
        `<span class="tour-tag">${tag}</span>`
    ).join('');
    
    const description = tour.description || '';
    const truncatedDesc = description.length > 120 
        ? description.substring(0, 117) + '...' 
        : description;
    
    const score = tour.qualityScore || 0;
    const badge = scoreLabel(score);
    const qualityBadge = badge 
        ? `<span class="quality-badge">⭐ ${badge}</span>` 
        : '';
    
    const cleanLoc = cleanLocation(tour.location);
    const priceDisplay = formatPrice(tour.price);
    
    const schema = generateTourSchema(tour);
    const schemaJson = JSON.stringify(schema);
    
    let badgesHtml = '<div class="tour-badges">';
    if (tour.freeCancellation) {
        badgesHtml += '<span class="trust-badge free-cancel">Free Cancellation</span>';
    }
    badgesHtml += '<span class="trust-badge instant">Instant Confirmation</span>';
    badgesHtml += '<span class="trust-badge local">Local Operator</span>';
    badgesHtml += '</div>';
    
    return `
        <article class="tour-card" data-id="${tour.id}">
            <script type="application/ld+json">${schemaJson}</script>
            <div class="tour-image">
                <img src="${tour.image}" alt="${tour.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400'">
                ${qualityBadge}
            </div>
            <div class="tour-content">
                <div class="tour-meta">
                    <span class="tour-location">📍 ${cleanLoc}</span>
                </div>
                <h3 class="tour-title">${tour.name}</h3>
                <p class="tour-description">${truncatedDesc}</p>
                <div class="tour-tags">${tagDisplay}</div>
                ${badgesHtml}
                <div class="tour-footer">
                    <div class="tour-price">${priceDisplay}</div>
                    <button onclick="openBookingWithLoader('${tour.bookingLink}')" class="tour-book-btn" style="cursor: pointer; border: none; background: none; padding: 0;">
                        Book Now →
                    </button>
                </div>
            </div>
        </article>
    `;
}

// Load and display tours
async function loadTours() {
    try {
        const response = await fetch('puertorico-tours.json');
        toursData = await response.json();
        
        const shuffled = shuffleArray([...toursData]).slice(0, 50);
        preCacheBookingUrls(shuffled);
        
        const grid = document.getElementById('tours-grid');
        if (grid) {
            grid.innerHTML = shuffled.map(tour => createTourCard(tour)).join('');
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
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === 'price-high') {
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === 'rating') {
        filtered.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    }
    
    const grid = document.getElementById('tours-grid');
    if (grid) {
        grid.innerHTML = filtered.slice(0, 50).map(tour => createTourCard(tour)).join('');
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
