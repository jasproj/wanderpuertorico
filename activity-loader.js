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

        // Filter tours by tags + drop inactive, then shuffle per-page-load before slicing
        const filtered = allTours.filter(tour => {
            if (tour.status === 'inactive') return false;
            return (tour.tags || []).some(tag => filterTags.includes(tag));
        });
        // Pin proven-converting winners to the top (per-page via #activity-pinned-pks),
        // then shuffle the rest for fair rotation. A pinned pk that is missing/inactive
        // is silently skipped (filter(Boolean)), never errors.
        const pinnedPks = JSON.parse(document.getElementById('activity-pinned-pks')?.textContent || '[]');
        const pinnedTours = pinnedPks.map(pk => filtered.find(t => t.pk === pk)).filter(Boolean);
        const rest = filtered.filter(t => !pinnedPks.includes(t.pk));
        const filteredTours = [...pinnedTours, ...shuffleArray(rest)].slice(0, limit);
        
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (filteredTours.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">No tours available at this time.</p>';
            return;
        }
        
        const html = filteredTours.map(tour => `
            <div class="tour-card">
                <div class="tour-image">
                    <img src="${tour.image || FALLBACK_IMAGE}" alt="${tour.name}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
                    <div class="tour-overlay">
                        <a href="${tour.bookingUrl}" target="_blank" rel="noopener" class="tour-book-btn" onclick="trackBookingClick('${tour.name.replace(/'/g, "\\'")}', '${tour.id}')">
                            Check Availability →
                        </a>
                    </div>
                </div>
                <div class="tour-content">
                    <h3>${tour.name}</h3>
                    <p class="tour-company">${tour.company}</p>
                    <p class="tour-location">📍 ${tour.location}</p>
                    <div class="tour-tags">
                        ${tour.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
            </div>
        `).join('');
        
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
