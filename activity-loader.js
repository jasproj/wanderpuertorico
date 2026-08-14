// Applied at render time, not just via onerror: 16 records have no image
// field, and `src="undefined"` costs a real 404 before any fallback runs.
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

// Shared tour loading and filtering for activity pages
async function loadActivityTours(filterTags, containerId = 'tours-grid', limit = 12) {
    try {
        const response = await fetch('/tours-data.json');
        const _raw = await response.json();
        const allTours = Array.isArray(_raw) ? _raw : _raw.tours;

        // The live pool: everything bookable, regardless of tags.
        const live = allTours.filter(tour => tour.status !== 'inactive' && !tour.bookingDead);
        // The tag-filtered subset feeds the UNPINNED remainder only.
        const filtered = live.filter(tour => (tour.tags || []).some(tag => filterTags.includes(tag)));

        // A pin is an explicit editorial choice, so it resolves against `live`, NOT against
        // `filtered`. Resolving pins against the tag-filtered subset reinstated the very
        // defect rostering exists to bypass: 869 of 1167 records carry `tags: []`, so every
        // genuine Old San Juan walking tour was unpinnable on the page about Old San Juan.
        // The unpinned remainder still comes from the tag filter and still shuffles.
        //
        // A pin that matches no record at all is still skipped rather than rendered, but it
        // now warns. The silent skip is what kept this class of defect invisible: a typo'd or
        // retired pk looked indistinguishable from a working roster.
        const pinnedPks = JSON.parse(document.getElementById('activity-pinned-pks')?.textContent || '[]');
        const pinnedTours = pinnedPks.map(pk => {
            const tour = live.find(t => t.pk === pk);
            if (!tour) {
                console.warn('[activity-loader] pinned pk ' + pk + ' matched no live record '
                    + '(missing, inactive, or bookingDead) — skipped.');
            }
            return tour;
        }).filter(Boolean);
        const rest = filtered.filter(t => !pinnedPks.includes(t.pk));
        const filteredTours = [...pinnedTours, ...shuffleArray(rest)].slice(0, limit);
        
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (filteredTours.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">No tours available at this time.</p>';
            return;
        }
        
        const html = filteredTours.map(tour => {
            // formatPrice / generateTourSchema / escapeHtml come from
            // tour-render.js, shared with app.js. Not reimplemented here.
            const priceDisplay = formatPrice(tour.price, tour.priceConfidence);
            // Make the basis explicit when the stored tier is not a per-seat
            // fare, so "From $2510" cannot read as a per-person price.
            const label = (tour.priceLabel || '');
            const basis = /whole boat|charter|per vehicle|vehicle|private boat|boat$/i.test(label)
                ? ' <span class="tour-price-basis">' + escapeHtml(label) + '</span>'
                : '';
            const schemaJson = JSON.stringify(generateTourSchema(tour)).replace(/<\/script/gi, '<\\/script');
            return `
            <div class="tour-card">
                <script type="application/ld+json">${schemaJson}</script>
                <div class="tour-image">
                    <img src="${tour.image || FALLBACK_IMAGE}" alt="${escapeHtml(tour.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
                </div>
                <div class="tour-content">
                    <h3>${escapeHtml(tour.name)}</h3>
                    <p class="tour-company">${escapeHtml(tour.company)}</p>
                    <p class="tour-location">📍 ${escapeHtml(tour.location)}</p>
                    <div class="tour-tags">
                        ${tour.tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="tour-footer">
                        <div class="tour-price">${priceDisplay}${basis}</div>
                        <a href="${tour.bookingUrl}" target="_blank" rel="noopener" class="tour-book-btn" onclick="trackBookingClick('${tour.name.replace(/'/g, "\\'")}', '${tour.id}')">Check Availability →</a>
                    </div>
                </div>
            </div>
        `;}).join('');
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading tours:', error);
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">Unable to load tours. Please try again later.</p>';
        }
    }
}

function trackBookingClick(tourName, tourId, region = '') {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'booking_click', {
            'event_category': 'conversion',
            'event_label': tourName,
            'tour_id': tourId,
            'region': region || 'puerto-rico'
        });
    }
}

// Load tours when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const filterTagsElement = document.getElementById('activity-filter-tags');
    if (filterTagsElement) {
        const tags = JSON.parse(filterTagsElement.textContent);
        const limit = document.getElementById('tour-limit')?.textContent || '12';
        loadActivityTours(tags, 'tours-grid', parseInt(limit));
    }
});
