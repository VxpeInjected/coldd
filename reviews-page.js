/* Renders every approved review (window.__REVIEWS, populated by catalog.js
   from the real `reviews` table, approved-only - the same admin moderation
   queue that already gates product-page reviews) into the /reviews page's
   grid. Nothing to do here beyond render: approving/hiding a review in
   admin is what adds or removes it from this page - there's no separate
   publish step and no page-specific data of its own. */
(function () {
  var grid = document.getElementById('allReviewsGrid');
  if (!grid) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.1l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.16l-5.9 3.11 1.13-6.57L2.45 9.04l6.6-.96z"/></svg>';
  function starsHtml(n) {
    var h = '';
    for (var i = 0; i < 5; i++) h += (i < n ? STAR_SVG : '<span class="off">' + STAR_SVG + '</span>');
    return h;
  }

  var filtersEl = document.getElementById('reviewFilters');
  var activeFilter = 'all';
  // Positive/negative are convenience buckets on top of the exact star
  // filters, not a separate rating scale - 4-5 stars reads as a positive
  // review, 1-3 doesn't (splitting negative from a 3-star "it's fine"
  // would be reading sentiment into a middling rating that isn't there).
  function matchesFilter(r) {
    var stars = r.stars || 0;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'positive') return stars >= 4;
    if (activeFilter === 'negative') return stars > 0 && stars <= 3;
    return stars === Number(activeFilter);
  }

  function render() {
    var all = (window.__REVIEWS || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    if (!all.length) { grid.innerHTML = '<p class="pd-empty">No reviews yet.</p>'; return; }

    var reviews = all.filter(matchesFilter);
    if (!reviews.length) { grid.innerHTML = '<p class="pd-empty">No reviews match this filter.</p>'; return; }

    var catalogById = {};
    (window.__CATALOG || []).forEach(function (p) { catalogById[p.id] = p; });

    grid.innerHTML = reviews.map(function (r) {
      var initial = (r.user || '?').trim().charAt(0).toUpperCase() || '?';
      var product = catalogById[r.productId];
      return '<article class="glass review reveal">' +
        '<div class="stars" aria-label="' + (r.stars || 0) + ' out of 5">' + starsHtml(r.stars || 0) + '</div>' +
        '<p>"' + esc(r.text) + '"</p>' +
        '<div class="review-by"><span class="ra">' + esc(initial) + '</span><span class="rn">' + esc(r.user) + (product ? '<small>' + esc(product.title) + '</small>' : '') + '</span></div>' +
        '</article>';
    }).join('');
    // app.js's scroll-reveal observer already ran by the time this fires
    // (this script is chained behind app.js in catalog.js's data-then), so
    // these newly-injected .reveal cards need to be handed to it explicitly
    // or they stay at their default html.js-scoped opacity:0 forever -
    // fully rendered, real content, permanently invisible. See app.js.
    if (window.__scanReveal) window.__scanReveal(grid);
  }

  if (filtersEl) filtersEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    activeFilter = btn.getAttribute('data-filter');
    filtersEl.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === btn); });
    render();
  });

  // catalog.js has already resolved window.__REVIEWS/__CATALOG by the time
  // this script runs (it's loaded via catalog.js's own data-then chain,
  // which only fires after that fetch settles) - render immediately.
  render();
})();
