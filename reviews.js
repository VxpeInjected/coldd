/* window.__REVIEWS is populated by catalog.js (fetched from the real
   `reviews` table, approved-only, alongside the product catalog, before
   this script runs) - this just exposes the productReviews(id) lookup
   API app.js expects. */
(function () {
  function allReviews() { return window.__REVIEWS || []; }

  function productReviews(productId) {
    return allReviews().filter(function (r) { return r.productId === productId; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }

  window.__reviews = { all: allReviews, productReviews: productReviews };
})();
