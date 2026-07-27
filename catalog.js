(function () {
  // Captured synchronously - document.currentScript is only valid during
  // this script's initial synchronous execution, not inside the async
  // fetch callbacks below.
  var thisScript = document.currentScript;

  window.__CATEGORIES = [{"label": "Resell License", "slug": "resell", "platform": "Roblox", "page": "assets.html"}, {"label": "Finished Games & Templates", "slug": "game-templates", "platform": "Roblox", "page": "assets.html"}, {"label": "Maps", "slug": "maps", "platform": "Roblox", "page": "assets.html"}, {"label": "Scripts & UI", "slug": "scripts-ui", "platform": "Roblox", "page": "assets.html"}, {"label": "Graphics", "slug": "graphics", "platform": "Roblox", "page": "assets.html"}, {"label": "Buildings", "slug": "buildings", "platform": "Roblox", "page": "assets.html"}, {"label": "Assets", "slug": "assets", "platform": "Roblox", "page": "assets.html"}, {"label": "Uniforms & Gear", "slug": "uniforms-gear", "platform": "Roblox", "page": "assets.html"}, {"label": "Boats", "slug": "boats", "platform": "Roblox", "page": "assets.html"}, {"label": "Weapons", "slug": "weapons", "platform": "Roblox", "page": "assets.html"}, {"label": "Vehicles", "slug": "vehicles", "platform": "Roblox", "page": "assets.html"}, {"label": "Animations & VFX", "slug": "animations-vfx", "platform": "Roblox", "page": "assets.html"}];

  function loadDependents() {
    var target = thisScript && thisScript.parentNode ? thisScript.parentNode : document.body;
    // Each page declares which scripts it needs loaded after the catalog is
    // ready via data-then="a.js,b.js" on this <script> tag, since different
    // pages chain different scripts here (app.js alone; blog.js+app.js;
    // reviews.js+app.js; blog.js+reviews.js+admin.js with no app.js at all).
    var attr = thisScript && thisScript.getAttribute('data-then');
    var scripts = attr ? attr.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['app.js'];

    function loadNext(i) {
      if (i >= scripts.length) return;
      var s = document.createElement('script');
      s.src = scripts[i];
      s.onload = function () { loadNext(i + 1); };
      target.appendChild(s);
    }
    loadNext(0);
  }

  function fmtPrice(n) {
    return '$' + (n % 1 === 0 ? n : n.toFixed(2));
  }

  function toCard(row) {
    var priceNum = Number(row.price_usd) || 0;
    return {
      id: row.slug,
      title: row.title,
      price: fmtPrice(priceNum),
      priceNum: priceNum,
      image: row.image,
      cat: row.cat,
      desc: row.description,
      resell: !!row.resell_available,
      was: Number(row.was_price) || 0,
      subcat: row.subcat || '',
      reviews: row.reviews_count || 0,
      rating: Number(row.rating) || 0,
      platform: row.platform,
      page: row.page
    };
  }

  function fail(err) {
    if (err) console.error('[coldd] Failed to load live product catalog, falling back to empty:', err);
    window.__CATALOG = [];
    loadDependents();
  }

  if (!window.coldSupabase) { fail(); return; }

  window.coldSupabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .then(function (res) {
      if (res.error) { fail(res.error); return; }
      window.__CATALOG = (res.data || []).map(toCard);
      loadDependents();
    })
    .catch(fail);
})();
