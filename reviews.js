/* Shared review data + helpers for the admin panel and public product pages.
   Mirrors blog.js's role: a deterministic seed (here, generated from the full
   catalog rather than hand-authored) plus a localStorage-backed reader both
   admin.js and app.js call, so a review moderated/replied-to in the admin
   panel is the exact same review shown on product.html - not two disconnected
   fake lists. */
(function () {
  function hsh(s) {
    var h = 5381; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function pick(arr, seed) { return arr[hsh(seed) % arr.length]; }
  function daysAgo(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

  var USER_NAMES = ['deonte123', 'mrbuilds', 'vortex_dev', 'skylar', 'notacow', 'jaydengg', 'rblxpro', 'emberkid', 'q_zen', 'frostbyte', 'halcyon', 'devkai', 'pixel_wren', 'noctown', 'siege_ii', 'kryo', 'buildrjay', 'ashfall', 'trestin', 'novaquartz', 'griefstop', 'lumen_x', 'obsidianrp', 'wickfire', 'tundraa', 'meshking', 'ravencl', 'ninthgate', 'zeph', 'coalport'];
  var RTEXT = ['works great, exactly what i needed for my game', 'clean code and easy to set up, would recommend', 'in studio its a little laggy but overall solid', 'good value and support was really helpful', 'took a bit to figure out setup but works well', 'amazing quality, already planning to buy more', 'does exactly what it says, no complaints', 'better than expected for the price', 'the file was broken on first download, had to redownload', 'kind of overpriced for what it is honestly'];

  var REVIEWS_KEY = 'coldd_admin_reviews_v1';

  function generateSeed() {
    var catalog = window.__CATALOG || [];
    var out = [], id = 1;
    catalog.forEach(function (p) {
      if (!p.reviews) return;
      var n = (hsh(p.id + 'rv') % 3) + 1;
      for (var i = 0; i < n; i++) {
        var s = p.id + 'rv' + i;
        var h = hsh(s);
        var stars = 2 + (h % 4);
        var statusRoll = h % 100;
        out.push({
          id: 'rv' + (id++),
          productId: p.id,
          productTitle: p.title,
          user: pick(USER_NAMES, s),
          stars: stars,
          text: RTEXT[(h >> 3) % RTEXT.length],
          date: daysAgo(h % 90).toISOString(),
          status: statusRoll < 10 ? 'pending' : (statusRoll < 15 ? 'hidden' : 'approved'),
          reply: null
        });
      }
    });
    return out;
  }

  window.__REVIEWS = generateSeed();

  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  }
  function allReviews() { return lsGet(REVIEWS_KEY, window.__REVIEWS) || []; }
  function productReviews(productId) {
    return allReviews()
      .filter(function (r) { return r.productId === productId && r.status !== 'hidden'; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }

  window.__reviews = { key: REVIEWS_KEY, all: allReviews, productReviews: productReviews };
})();
