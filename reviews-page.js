/* Renders every approved customer review (window.__REVIEWS, populated by
   catalog.js from the real `reviews` table - same admin approval queue
   used on product pages) into the /reviews page's "All reviews" grid.
   Nothing to do here beyond render: approving a review in admin is what
   makes it show up here, there's no separate publish step. */
(function () {
  var grid = document.getElementById('customerReviewsGrid');
  if (!grid) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return iso; }
  }
  function starsHtml(n) {
    var h = '';
    for (var i = 0; i < 5; i++) {
      h += '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="opacity:' + (i < n ? '1' : '.25') + '"><path d="M12 2.1l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.16l-5.9 3.11 1.13-6.57L2.45 9.04l6.6-.96z"/></svg>';
    }
    return h;
  }

  var reviews = (window.__REVIEWS || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  if (!reviews.length) return;

  var catalogById = {};
  (window.__CATALOG || []).forEach(function (p) { catalogById[p.id] = p; });

  grid.innerHTML = reviews.map(function (r) {
    var initial = (r.user || '?').trim().charAt(0).toUpperCase() || '?';
    var product = catalogById[r.productId];
    var sub = (product ? product.title + ' · ' : '') + fmtDate(r.date);
    return '<article class="glass review reveal">' +
      '<div class="stars" aria-label="' + (r.stars || 0) + ' out of 5">' + starsHtml(r.stars || 0) + '</div>' +
      '<p>"' + esc(r.text) + '"</p>' +
      '<div class="review-by"><span class="ra">' + esc(initial) + '</span><span class="rn">' + esc(r.user) + '<small>' + esc(sub) + '</small></span></div>' +
      '</article>';
  }).join('');
})();
