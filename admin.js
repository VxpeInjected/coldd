(function () {
  'use strict';

  /* ================================================================
     ACCESS GATE
     Restricted to the Discord IDs in supabase-init.js's ADMIN_WHITELIST
     (window.coldAuth.isAdminWhitelisted) - single source of truth shared
     with the admin-panel link on dashboard.html.
     ================================================================ */
  function isAllowed() {
    return !!(window.coldAuth && window.coldAuth.isAdminWhitelisted());
  }

  var gate = document.getElementById('admGate');
  var shell = document.getElementById('admShell');
  if (!isAllowed()) {
    if (gate) gate.hidden = false;
    if (shell) shell.hidden = true;
    return;
  }
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;

  /* ================================================================
     UTILITIES
     ================================================================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hsh(s) {
    var h = 5381; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function rnd(seed) { return (hsh(seed) % 10000) / 10000; }
  function pick(arr, seed) { return arr[hsh(seed) % arr.length]; }
  var ROBUX_PER_USD = 80;
  var DEVEX_USD_PER_ROBUX = 0.0038;
  var AUD_RATE = 1.52;
  function usd(n) { return '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function usd0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function aud(n) { return 'A$' + (Math.round((Number(n) || 0) * AUD_RATE * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function robux(n) { return 'R$ ' + Math.round((Number(n) || 0) * ROBUX_PER_USD).toLocaleString('en-US'); }
  function pct(n) { return (Math.round((Number(n) || 0) * 10) / 10) + '%'; }
  function fmtDate(d) { return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtDateTime(d) { return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function daysAgo(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; }
  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function seedIfEmpty(key, gen) {
    var existing = null;
    try { existing = localStorage.getItem(key); } catch (_) {}
    if (existing != null) return lsGet(key, []);
    var data = gen();
    lsSet(key, data);
    return data;
  }

  /* ================================================================
     MOCK "DATABASE" — seeded once, then persisted + mutated in
     localStorage like every other piece of state on this site
     (cart, wishlist, owned products). There is no real backend here,
     so these numbers are synthetic but internally consistent: orders
     reference real catalog products and real seeded users, and every
     aggregate (revenue, best sellers, coupon usage, referral earnings)
     is computed live from this same order ledger rather than being
     independently faked.
     ================================================================ */
  var CATALOG = window.__CATALOG || [];

  var USER_NAMES = ['deonte123', 'mrbuilds', 'vortex_dev', 'skylar', 'notacow', 'jaydengg', 'rblxpro', 'emberkid', 'q_zen', 'frostbyte', 'halcyon', 'devkai', 'pixel_wren', 'noctown', 'siege_ii', 'kryo', 'buildrjay', 'ashfall', 'trestin', 'novaquartz', 'griefstop', 'lumen_x', 'obsidianrp', 'wickfire', 'tundraa', 'meshking', 'ravencl', 'ninthgate', 'zeph', 'coalport'];
  var STAFF_SEED = [
    { id: 'st1', name: 'Jordan', discordId: '', role: 'owner' },
    { id: 'st2', name: 'kaden.dev', discordId: '', role: 'admin' },
    { id: 'st3', name: 'mod_ash', discordId: '', role: 'support' }
  ];

  var USERS = seedIfEmpty('coldd_admin_users_v1', function () {
    var out = [];
    for (var i = 0; i < USER_NAMES.length; i++) {
      var h = hsh('user' + i);
      out.push({
        id: 'u' + (i + 1),
        name: USER_NAMES[i],
        email: USER_NAMES[i].replace(/[^a-z0-9]/g, '') + '@example.com',
        discordId: String(200000000000000000 + (h % 700000000000000000)),
        joined: daysAgo(20 + (h % 340)).toISOString(),
        status: (h % 23 === 0) ? 'banned' : 'active'
      });
    }
    return out;
  });

  var COUPONS = seedIfEmpty('coldd_admin_coupons_v1', function () {
    return [
      { code: 'SAVE10', type: 'pct', val: 10, active: true, limit: null },
      { code: 'COLDD20', type: 'pct', val: 20, active: true, limit: 500 },
      { code: 'WELCOME5', type: 'flat', val: 5, active: true, limit: null },
      { code: 'SUMMER25', type: 'pct', val: 25, active: false, limit: 200 }
    ];
  });

  var STAFF = seedIfEmpty('coldd_admin_staff_v1', function () { return STAFF_SEED; });

  var REF_CODES = ['kaden', 'vortex', 'skylar', 'frostbyte', 'novaquartz'];
  var REFERRALS = seedIfEmpty('coldd_admin_referrals_v1', function () {
    return REF_CODES.map(function (code, i) {
      var h = hsh('ref' + code);
      var clicks = 80 + (h % 500);
      var signups = Math.round(clicks * (0.05 + (h % 20) / 100));
      var conversions = Math.round(signups * (0.2 + (h % 30) / 100));
      var earned = Math.round(conversions * (8 + (h % 40)) * 100) / 100;
      var paid = Math.round(earned * 0.6 * 100) / 100;
      return { code: code, owner: pick(USER_NAMES, code), clicks: clicks, signups: signups, conversions: conversions, earnedUSD: earned, paidUSD: paid };
    });
  });

  var ORDERS = seedIfEmpty('coldd_admin_orders_v1', function () {
    var out = [], ordId = 1000;
    var roblox = CATALOG.filter(function (p) { return p.platform !== 'Minecraft' || true; });
    for (var day = 119; day >= 0; day--) {
      var date = daysAgo(day);
      var seedBase = 'day' + day;
      var n = hsh(seedBase) % 6; // 0-5 orders that day
      for (var i = 0; i < n; i++) {
        var s = seedBase + 'o' + i;
        var h = hsh(s);
        var product = CATALOG.length ? CATALOG[h % CATALOG.length] : null;
        if (!product) continue;
        var licence = (product.resell && (h % 100) < 12) ? 'resell' : 'standard';
        var qty = 1 + ((h >> 4) % 100 < 6 ? 1 : 0);
        var unit = licence === 'resell' ? Math.round(product.priceNum * 3) : product.priceNum;
        var subtotal = unit * qty;
        var couponRoll = (h >> 6) % 100;
        var activeCoupons = COUPONS.filter(function (c) { return c.active; });
        var coupon = (couponRoll < 14 && activeCoupons.length) ? activeCoupons[h % activeCoupons.length] : null;
        var discount = 0;
        if (coupon) discount = coupon.type === 'pct' ? Math.round(subtotal * coupon.val) / 100 : Math.min(coupon.val, subtotal);
        var total = Math.round((subtotal - discount) * 100) / 100;
        var currRoll = (h >> 9) % 100;
        var currency = currRoll < 55 ? 'usd' : (currRoll < 75 ? 'aud' : (licence !== 'resell' ? 'robux' : 'usd'));
        var statusRoll = (h >> 12) % 100;
        var status = statusRoll < 4 ? 'refunded' : (statusRoll < 7 && day < 2 ? 'pending' : 'completed');
        var refRoll = (h >> 15) % 100;
        var refCode = refRoll < 22 ? REF_CODES[h % REF_CODES.length] : null;
        var user = USERS.length ? USERS[h % USERS.length] : null;
        out.push({
          id: 'CLD-' + (ordId++),
          date: date.toISOString(),
          userId: user ? user.id : null,
          userName: user ? user.name : 'guest',
          productId: product.id,
          title: product.title,
          image: product.image,
          cat: product.cat,
          platform: product.platform,
          licence: licence,
          qty: qty,
          unitPrice: unit,
          subtotal: subtotal,
          couponCode: coupon ? coupon.code : null,
          discount: discount,
          total: total,
          currency: currency,
          status: status,
          refCode: refCode,
          refundReason: status === 'refunded' ? pick(['Not as described', 'Accidental purchase', 'Technical issue', 'Duplicate charge'], s) : null
        });
      }
    }
    return out;
  });

  var REVIEWS = seedIfEmpty('coldd_admin_reviews_v1', function () {
    var RTEXT = ['works great, exactly what i needed for my game', 'clean code and easy to set up, would recommend', 'in studio its a little laggy but overall solid', 'good value and support was really helpful', 'took a bit to figure out setup but works well', 'amazing quality, already planning to buy more', 'does exactly what it says, no complaints', 'better than expected for the price', 'the file was broken on first download, had to redownload', 'kind of overpriced for what it is honestly'];
    var out = [], id = 1;
    CATALOG.slice(0, 22).forEach(function (p) {
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
          status: statusRoll < 10 ? 'pending' : (statusRoll < 15 ? 'hidden' : 'approved')
        });
      }
    });
    return out;
  });

  var TRAFFIC = seedIfEmpty('coldd_admin_traffic_v1', function () {
    var out = [];
    for (var day = 119; day >= 0; day--) {
      var h = hsh('traf' + day);
      var sessions = 90 + (h % 260);
      var pageviews = Math.round(sessions * (2.1 + (h % 30) / 10));
      out.push({ date: daysAgo(day).toISOString(), sessions: sessions, pageviews: pageviews });
    }
    return out;
  });

  var ABANDONED = seedIfEmpty('coldd_admin_abandoned_v1', function () {
    var out = [];
    for (var i = 0; i < 26; i++) {
      var s = 'ab' + i;
      var h = hsh(s);
      var p = CATALOG.length ? CATALOG[h % CATALOG.length] : null;
      if (!p) continue;
      out.push({ id: 'ab' + i, date: daysAgo(h % 45).toISOString(), title: p.title, image: p.image, value: p.priceNum, email: (h % 3 === 0) ? (pick(USER_NAMES, s) + '@example.com') : null });
    }
    return out.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  });

  var PROD_OV = lsGet('coldd_admin_prod_ov_v1', {});
  var EXTRA_PRODUCTS = lsGet('coldd_admin_extra_products_v1', []);
  var AUDIT = lsGet('coldd_admin_audit_v1', []);

  function saveOrders() { lsSet('coldd_admin_orders_v1', ORDERS); }
  function saveUsers() { lsSet('coldd_admin_users_v1', USERS); }
  function saveCoupons() { lsSet('coldd_admin_coupons_v1', COUPONS); }
  function saveStaff() { lsSet('coldd_admin_staff_v1', STAFF); }
  function saveReviews() { lsSet('coldd_admin_reviews_v1', REVIEWS); }
  function saveProdOv() { lsSet('coldd_admin_prod_ov_v1', PROD_OV); }
  function saveExtraProducts() { lsSet('coldd_admin_extra_products_v1', EXTRA_PRODUCTS); }
  function saveReferrals() { lsSet('coldd_admin_referrals_v1', REFERRALS); }

  function logAudit(action) {
    AUDIT.unshift({ ts: new Date().toISOString(), actor: currentRole().name, action: action });
    if (AUDIT.length > 300) AUDIT.length = 300;
    lsSet('coldd_admin_audit_v1', AUDIT);
    if (curPanel === 'audit') renderAudit();
  }

  /* ================================================================
     ROLE (stand-in for real auth; drives permission gating)
     ================================================================ */
  var ROLES = { owner: 3, admin: 2, support: 1 };
  function currentRole() {
    var id = lsGet('coldd_admin_role_v1', null);
    var staff = STAFF.filter(function (s) { return s.id === id; })[0];
    return staff || STAFF[0] || { id: 'st1', name: 'You', role: 'owner' };
  }
  function setRole(id) { lsSet('coldd_admin_role_v1', id); renderTopbar(); renderAll(); }
  function can(minRole) { return ROLES[currentRole().role] >= ROLES[minRole]; }

  /* ================================================================
     PRODUCT VIEW MODEL (catalog + admin overrides + extra products)
     ================================================================ */
  function defaultLegal() {
    return { tos: '', proofFiles: [], devProofFiles: [], contacts: [], licenseCost: 0, licenseCostCurrency: 'usd', licensePurchasedAt: '', minSaleUsd: 0, minSaleRobux: 0, canBeFree: false, disallowSales: false };
  }
  function toYouTubeEmbed(url) {
    url = (url || '').trim();
    if (!url) return '';
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
    return m ? ('https://www.youtube.com/embed/' + m[1]) : url;
  }
  function defaultTech() {
    return { format: '', size: '', fileName: '', parts: '', meshParts: '', unions: '', scripts: '' };
  }
  function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }
  function allProducts() {
    var base = CATALOG.map(function (p) {
      var ov = PROD_OV[p.id] || {};
      return Object.assign({}, p, {
        title: ov.title != null ? ov.title : p.title,
        price: ov.price != null ? ov.price : p.priceNum,
        cat: ov.cat != null ? ov.cat : p.cat,
        desc: ov.desc != null ? ov.desc : p.desc,
        longDesc: ov.longDesc || '',
        image: ov.image != null ? ov.image : p.image,
        gallery: ov.gallery || [],
        video: ov.video || '',
        resell: ov.resell != null ? ov.resell : p.resell,
        resellPrice: ov.resellPrice != null ? ov.resellPrice : null,
        robuxPrice: ov.robuxPrice != null ? ov.robuxPrice : null,
        tech: Object.assign(defaultTech(), ov.tech || {}),
        legal: Object.assign(defaultLegal(), ov.legal || {}),
        versions: ov.versions || [],
        visible: ov.visible !== false,
        extra: false
      });
    });
    var extra = EXTRA_PRODUCTS.map(function (p) {
      return Object.assign({}, p, {
        longDesc: p.longDesc || '',
        gallery: p.gallery || [],
        video: p.video || '',
        resellPrice: p.resellPrice != null ? p.resellPrice : null,
        robuxPrice: p.robuxPrice != null ? p.robuxPrice : null,
        tech: Object.assign(defaultTech(), p.tech || {}),
        legal: Object.assign(defaultLegal(), p.legal || {}),
        versions: p.versions || [],
        extra: true,
        visible: p.visible !== false
      });
    });
    return base.concat(extra);
  }
  function findProduct(id) { return allProducts().filter(function (p) { return p.id === id; })[0]; }
  function saveProductFields(id, isExtra, fields) {
    if (isExtra) {
      var ep = EXTRA_PRODUCTS.filter(function (x) { return x.id === id; })[0];
      if (ep) Object.assign(ep, fields);
      saveExtraProducts();
    } else {
      PROD_OV[id] = Object.assign({}, PROD_OV[id], fields);
      saveProdOv();
    }
  }

  /* ================================================================
     DATE RANGE
     ================================================================ */
  var RANGE_DAYS = lsGet('coldd_admin_range_v1', 30); // 1, 7, 30, 90, 0(=all)
  function inRange(iso) {
    if (!RANGE_DAYS) return true;
    var d = new Date(iso);
    return d >= daysAgoStart(RANGE_DAYS);
  }
  function daysAgoStart(n) { var d = daysAgo(n - 1); d.setHours(0, 0, 0, 0); return d; }
  function setRange(n) {
    RANGE_DAYS = n; lsSet('coldd_admin_range_v1', n);
    document.querySelectorAll('.adm-range button').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-range') === n); });
    if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'home') renderHome();
  }

  /* ================================================================
     CHART HELPER (inline SVG, no external deps)
     ================================================================ */
  function svgBars(data, opts) {
    opts = opts || {};
    var w = opts.width || 640, h = opts.height || 140;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; }).concat([1]));
    var n = data.length || 1;
    var gap = 2;
    var bw = Math.max(1, (w / n) - gap);
    var bars = data.map(function (d, i) {
      var bh = Math.max(1.5, (d.v / max) * (h - 6));
      var x = i * (w / n);
      var y = h - bh;
      var op = 0.42 + 0.58 * (max ? d.v / max : 0);
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (opts.color || 'var(--accent)') + '" opacity="' + op.toFixed(2) + '"><title>' + esc(d.label) + ': ' + esc(d.tip != null ? d.tip : d.v) + '</title></rect>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="adm-chart" preserveAspectRatio="none">' + bars + '</svg>';
  }

  /* ================================================================
     AGGREGATION (all computed live from ORDERS for the active range)
     ================================================================ */
  function ordersInRange() { return ORDERS.filter(function (o) { return inRange(o.date); }); }
  function completedInRange() { return ordersInRange().filter(function (o) { return o.status === 'completed'; }); }

  function revenueTotals() {
    var comp = completedInRange();
    var totalUSD = 0, byCurrency = { usd: 0, aud: 0, robux: 0 };
    comp.forEach(function (o) { totalUSD += o.total; byCurrency[o.currency] = (byCurrency[o.currency] || 0) + o.total; });
    return { totalUSD: totalUSD, byCurrency: byCurrency, count: comp.length };
  }
  function bestSellers(limit) {
    var map = {};
    completedInRange().forEach(function (o) {
      map[o.productId] = map[o.productId] || { id: o.productId, title: o.title, image: o.image, units: 0, revenue: 0 };
      map[o.productId].units += o.qty;
      map[o.productId].revenue += o.total;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, limit || 6);
  }
  function revenueByCategory() {
    var map = {};
    completedInRange().forEach(function (o) {
      map[o.cat] = (map[o.cat] || 0) + o.total;
    });
    return Object.keys(map).map(function (k) { return { label: k, v: map[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function dailyRevenueSeries() {
    var days = RANGE_DAYS || 120;
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = daysAgo(i);
      var key = d.toDateString();
      var v = 0;
      ORDERS.forEach(function (o) { if (o.status === 'completed' && new Date(o.date).toDateString() === key) v += o.total; });
      out.push({ label: fmtDate(d), v: Math.round(v * 100) / 100, tip: usd(v) });
    }
    return out;
  }
  function trafficSeries() {
    var days = RANGE_DAYS || 120;
    var rows = TRAFFIC.slice(Math.max(0, TRAFFIC.length - days));
    return rows.map(function (r) { return { label: fmtDate(new Date(r.date)), v: r.pageviews, tip: r.pageviews + ' views' }; });
  }
  function conversionRate() {
    var days = RANGE_DAYS || 120;
    var rows = TRAFFIC.slice(Math.max(0, TRAFFIC.length - days));
    var sessions = rows.reduce(function (s, r) { return s + r.sessions; }, 0);
    var orders = completedInRange().length;
    return sessions ? (orders / sessions) * 100 : 0;
  }
  function avgOrderValue() {
    var comp = completedInRange();
    if (!comp.length) return 0;
    return comp.reduce(function (s, o) { return s + o.total; }, 0) / comp.length;
  }
  function couponStats() {
    var comp = completedInRange();
    return COUPONS.map(function (c) {
      var used = comp.filter(function (o) { return o.couponCode === c.code; });
      var discountGiven = used.reduce(function (s, o) { return s + o.discount; }, 0);
      var revenue = used.reduce(function (s, o) { return s + o.total; }, 0);
      return { code: c.code, active: c.active, limit: c.limit, uses: used.length, discountGiven: discountGiven, revenue: revenue };
    });
  }

  /* ================================================================
     NAV / PANEL SWITCHING
     ================================================================ */
  var PANELS = ['home', 'analytics', 'products', 'product-edit', 'product-update', 'orders', 'refunds', 'reviews', 'users', 'coupons', 'posts', 'tutorials', 'releases', 'staff', 'audit'];
  var curPanel = 'home';
  function showPanel(name) {
    if (PANELS.indexOf(name) < 0) name = 'home';
    curPanel = name;
    PANELS.forEach(function (p) {
      var sec = $('adm-panel-' + p);
      if (sec) sec.hidden = (p !== name);
    });
    document.querySelectorAll('.dash-nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-panel') === name); });
    renderPanel(name);
    window.scrollTo(0, 0);
  }
  function renderPanel(name) {
    if (name === 'home') renderHome();
    else if (name === 'analytics') renderAnalytics();
    else if (name === 'products') renderProducts();
    else if (name === 'orders') renderOrders();
    else if (name === 'refunds') renderRefunds();
    else if (name === 'reviews') renderReviews();
    else if (name === 'users') renderUsers();
    else if (name === 'coupons') renderCoupons();
    else if (name === 'posts') renderPosts();
    else if (name === 'tutorials') renderTutorials();
    else if (name === 'releases') renderReleases();
    else if (name === 'staff') renderStaff();
    else if (name === 'audit') renderAudit();
  }
  function renderAll() { renderPanel(curPanel); }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-panel]');
    if (a) { e.preventDefault(); showPanel(a.getAttribute('data-panel')); }
  });

  /* ================================================================
     TOPBAR
     ================================================================ */
  function renderTopbar() {
    var r = currentRole();
    var sel = $('admRoleSelect');
    if (sel) {
      sel.innerHTML = STAFF.map(function (s) { return '<option value="' + s.id + '"' + (s.id === r.id ? ' selected' : '') + '>' + esc(s.name) + ' — ' + esc(s.role) + '</option>'; }).join('');
    }
    var av = $('admAvatar'); if (av) av.textContent = r.name.charAt(0).toUpperCase();
  }
  var roleSelect = $('admRoleSelect');
  if (roleSelect) roleSelect.addEventListener('change', function () { setRole(roleSelect.value); });

  document.querySelectorAll('.adm-range button').forEach(function (b) {
    b.addEventListener('click', function () { setRange(+b.getAttribute('data-range')); });
  });

  /* ================================================================
     HOME PANEL
     ================================================================ */
  function renderHome() {
    var todayKey = new Date().toDateString();
    var revToday = ORDERS.filter(function (o) { return o.status === 'completed' && new Date(o.date).toDateString() === todayKey; }).reduce(function (s, o) { return s + o.total; }, 0);
    var ordersToday = ORDERS.filter(function (o) { return new Date(o.date).toDateString() === todayKey; }).length;
    var signupsToday = USERS.filter(function (u) { return new Date(u.joined).toDateString() === todayKey; }).length;
    var pendingReviews = REVIEWS.filter(function (r) { return r.status === 'pending'; }).length;

    $('admHomeStats').innerHTML = [
      ['Revenue today', usd(revToday)],
      ['Orders today', ordersToday],
      ['New signups today', signupsToday],
      ['Reviews awaiting moderation', pendingReviews]
    ].map(function (s) { return '<div class="dash-stat glass"><span class="ds-label">' + s[0] + '</span><span class="ds-num">' + s[1] + '</span></div>'; }).join('');

    var recent = ORDERS.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 6);
    $('admHomeRecent').innerHTML = recent.map(orderRowHTML).join('') || '<p class="adm-empty">No orders yet.</p>';

    var banner = $('admModeBanner'); if (banner) banner.innerHTML = '<span class="dt-badge ok">Whitelist enforced</span>';
  }
  function orderRowHTML(o) {
    return '<div class="dash-row"><span class="dr-thumb" style="background-image:url(\'' + o.image + '\')"></span>' +
      '<div class="dr-main"><div class="dr-title">' + esc(o.title) + '</div><div class="dr-sub">' + fmtDateTime(new Date(o.date)) + ' · ' + esc(o.id) + ' · ' + esc(o.userName) + '</div></div>' +
      statusBadge(o.status) + '<span class="p-price" style="margin-left:12px;">' + usd(o.total) + '</span></div>';
  }
  function statusBadge(status) {
    var cls = status === 'completed' ? 'ok' : (status === 'refunded' ? 'err' : 'warn');
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    return '<span class="dt-badge ' + cls + '">' + label + '</span>';
  }

  /* ================================================================
     ANALYTICS PANEL
     ================================================================ */
  function renderAnalytics() {
    var rev = revenueTotals();
    var aov = avgOrderValue();
    var conv = conversionRate();

    $('admAnStats').innerHTML = [
      ['Revenue', usd(rev.totalUSD)],
      ['Orders', rev.count],
      ['Avg order value', usd(aov)],
      ['Conversion rate', pct(conv)]
    ].map(function (s) { return '<div class="dash-stat glass"><span class="ds-label">' + s[0] + '</span><span class="ds-num">' + s[1] + '</span></div>'; }).join('');

    $('admRevChart').innerHTML = svgBars(dailyRevenueSeries());

    // Currency breakdown: USD / AUD / Robux
    $('admCurrencyCards').innerHTML =
      '<div class="dash-stat glass"><span class="ds-label">USD revenue</span><span class="ds-num">' + usd(rev.byCurrency.usd || 0) + '</span></div>' +
      '<div class="dash-stat glass"><span class="ds-label">AUD revenue</span><span class="ds-num">' + aud(rev.byCurrency.aud || 0) + '</span><span class="adm-sub">' + usd(rev.byCurrency.aud || 0) + ' equiv.</span></div>' +
      '<div class="dash-stat glass"><span class="ds-label">Robux revenue</span><span class="ds-num">' + robux(rev.byCurrency.robux || 0) + '</span><span class="adm-sub">' + usd(rev.byCurrency.robux || 0) + ' equiv.</span></div>';

    var robuxRevUSD = rev.byCurrency.robux || 0;
    var robuxAmount = Math.round(robuxRevUSD * ROBUX_PER_USD);
    var devexPayout = robuxAmount * DEVEX_USD_PER_ROBUX;
    $('admDevex').innerHTML =
      '<div class="adm-devex-row"><span>Storefront rate (what buyers pay)</span><strong>1 USD = ' + ROBUX_PER_USD + ' Robux</strong></div>' +
      '<div class="adm-devex-row"><span>Robux taken in, this range</span><strong>' + robux(robuxRevUSD) + '</strong></div>' +
      '<div class="adm-devex-row"><span>Roblox DevEx payout rate</span><strong>$' + DEVEX_USD_PER_ROBUX.toFixed(4) + ' / Robux</strong></div>' +
      '<div class="adm-devex-row"><span>Est. USD if cashed out via DevEx</span><strong>' + usd(devexPayout) + '</strong></div>' +
      '<p class="adm-note">Robux is priced ~' + Math.round((ROBUX_PER_USD * DEVEX_USD_PER_ROBUX) * 100) + '% of face USD value after Roblox\'s DevEx conversion — this is why Robux checkout is marked up relative to card/PayPal.</p>';

    var best = bestSellers(6);
    $('admBestSellers').innerHTML = best.length ? best.map(function (p, i) {
      return '<div class="dash-row"><span class="adm-rank">#' + (i + 1) + '</span><span class="dr-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
        '<div class="dr-main"><div class="dr-title">' + esc(p.title) + '</div><div class="dr-sub">' + p.units + ' sold</div></div>' +
        '<span class="p-price">' + usd(p.revenue) + '</span></div>';
    }).join('') : '<p class="adm-empty">No completed orders in this range.</p>';

    var byCat = revenueByCategory();
    $('admCatChart').innerHTML = byCat.length ? svgBars(byCat.map(function (c) { return { label: c.label, v: c.v, tip: usd(c.v) }; }), { height: 120 }) : '<p class="adm-empty">No data.</p>';
    $('admCatList').innerHTML = byCat.map(function (c) {
      return '<div class="adm-catrow"><span>' + esc(c.label) + '</span><span>' + usd(c.v) + '</span></div>';
    }).join('');

    $('admTrafficChart').innerHTML = svgBars(trafficSeries(), { color: 'var(--price)' });
    var trafficRows = TRAFFIC.slice(Math.max(0, TRAFFIC.length - (RANGE_DAYS || 120)));
    var totalViews = trafficRows.reduce(function (s, r) { return s + r.pageviews; }, 0);
    var totalSessions = trafficRows.reduce(function (s, r) { return s + r.sessions; }, 0);
    $('admTrafficStats').innerHTML =
      '<div class="dash-stat glass"><span class="ds-label">Pageviews</span><span class="ds-num">' + totalViews.toLocaleString('en-US') + '</span></div>' +
      '<div class="dash-stat glass"><span class="ds-label">Sessions</span><span class="ds-num">' + totalSessions.toLocaleString('en-US') + '</span></div>';

    $('admReferralBody').innerHTML = REFERRALS.map(function (r) {
      var rate = r.clicks ? (r.conversions / r.clicks * 100) : 0;
      return '<tr><td class="dt-mono">' + esc(r.code) + '</td><td>' + esc(r.owner) + '</td><td>' + r.clicks + '</td><td>' + r.signups + '</td><td>' + r.conversions + '</td><td>' + pct(rate) + '</td><td>' + usd(r.earnedUSD) + '</td></tr>';
    }).join('');
    var owed = REFERRALS.reduce(function (s, r) { return s + (r.earnedUSD - r.paidUSD); }, 0);
    $('admAffiliateOwed').textContent = usd(owed);

    $('admAbandonedBody').innerHTML = ABANDONED.slice(0, 12).map(function (a) {
      return '<tr><td>' + fmtDate(new Date(a.date)) + '</td><td>' + esc(a.title) + '</td><td>' + usd(a.value) + '</td><td>' + (a.email ? esc(a.email) : '<span class="adm-sub">unknown</span>') + '</td></tr>';
    }).join('');
    $('admAbandonedTotal').textContent = usd(ABANDONED.reduce(function (s, a) { return s + a.value; }, 0));

    var cs = couponStats();
    $('admCouponAnBody').innerHTML = cs.map(function (c) {
      return '<tr><td class="dt-mono">' + esc(c.code) + '</td><td>' + (c.active ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Inactive</span>') + '</td><td>' + c.uses + (c.limit ? ' / ' + c.limit : '') + '</td><td>' + usd(c.discountGiven) + '</td><td>' + usd(c.revenue) + '</td></tr>';
    }).join('');

    document.querySelectorAll('.adm-range button').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-range') === RANGE_DAYS); });
  }

  /* ================================================================
     PRODUCTS PANEL
     ================================================================ */
  var ADM_ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
  var ADM_ICON_KEBAB = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';

  function purchaseCount(id) {
    return ORDERS.filter(function (o) { return o.productId === id && o.status !== 'refunded'; }).length;
  }
  function renderProducts() {
    var q = ($('admProdSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var rows = allProducts().filter(function (p) { return !q || p.title.toLowerCase().indexOf(q) >= 0; });
    $('admProdBody').innerHTML = rows.map(function (p) {
      var rating = (p.rating || 0).toFixed(1);
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><span class="dr-thumb" style="background-image:url(\'' + p.image + '\');width:52px;height:38px;display:inline-block;vertical-align:middle;border-radius:7px;"></span></td>' +
        '<td><a class="dt-link" href="product.html?id=' + esc(p.id) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>' + (p.extra ? ' <span class="adm-sub">(admin-only)</span>' : '') + '</td>' +
        '<td><span class="adm-cat-tag">' + esc(p.cat || 'Uncategorized') + '</span></td>' +
        '<td>' + (p.visible
          ? '<button type="button" class="dt-badge ok adm-prod-toggle"' + (can('admin') ? '' : ' disabled') + '>Released</button>'
          : '<button type="button" class="dt-badge warn adm-prod-toggle"' + (can('admin') ? '' : ' disabled') + '>Unreleased</button>') + '</td>' +
        '<td>' + rating + '<span class="adm-star">★</span></td>' +
        '<td>' + purchaseCount(p.id) + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="adm-icon-btn adm-prod-download" type="button" title="Download product file" aria-label="Download">' + ADM_ICON_DOWNLOAD + '</button>' +
          '<button class="adm-icon-btn adm-prod-edit" type="button" title="Edit product" aria-label="Edit">' + ADM_ICON_KEBAB + '</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No products match.</td></tr>';
  }
  var prodBody = $('admProdBody');
  if (prodBody) prodBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var p = findProduct(id); if (!p) return;
    if (e.target.closest('.adm-prod-toggle')) {
      if (!can('admin')) return;
      if (p.extra) {
        var ep = EXTRA_PRODUCTS.filter(function (x) { return x.id === id; })[0];
        if (ep) { ep.visible = !(ep.visible !== false); saveExtraProducts(); }
      } else {
        PROD_OV[id] = Object.assign({}, PROD_OV[id], { visible: !p.visible });
        saveProdOv();
      }
      logAudit((p.visible ? 'Unreleased' : 'Released') + ' product "' + p.title + '"');
      renderProducts();
    } else if (e.target.closest('.adm-prod-download')) {
      var a = document.createElement('a');
      a.href = 'placeholder.zip'; a.download = p.title.replace(/[^a-z0-9]+/gi, '-') + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
    } else if (e.target.closest('.adm-prod-edit')) {
      openProductEdit(id);
    }
  });
  var prodSearch = $('admProdSearch');
  if (prodSearch) prodSearch.addEventListener('input', renderProducts);

  /* ---- Product edit panel ---- */
  var ADM_ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  var CATEGORIES_BY_PLATFORM = {
    Roblox: ['Finished Games & Templates', 'Maps', 'Scripts & UI', 'Graphics', 'Buildings', 'Assets', 'Uniforms & Gear', 'Boats', 'Weapons', 'Vehicles', 'Animations & VFX'],
    Minecraft: ['Hubs', 'Lobbies', 'Maps', 'Builds', 'Plugins', 'Full Setups']
  };
  var editContacts = [];
  var editProofFiles = [];
  var editDevProofFiles = [];
  var editGallery = [];

  var catDD = $('admEditCatDD');
  var catDDBtn = catDD ? catDD.querySelector('.adm-dd-btn') : null;
  var catDDVal = catDD ? catDD.querySelector('.adm-dd-val') : null;
  var catDDMenu = catDD ? catDD.querySelector('.adm-dd-menu') : null;
  function closeCatDD() { if (catDD) catDD.classList.remove('open'); if (catDDMenu) catDDMenu.hidden = true; if (catDDBtn) catDDBtn.setAttribute('aria-expanded', 'false'); }
  function openCatDD() { if (catDD) catDD.classList.add('open'); if (catDDMenu) catDDMenu.hidden = false; if (catDDBtn) catDDBtn.setAttribute('aria-expanded', 'true'); }
  function setCatValue(c) {
    $('admEditCat').value = c || '';
    if (catDDVal) { catDDVal.textContent = c || 'Select category'; catDDVal.classList.toggle('placeholder', !c); }
    if (catDDMenu) Array.prototype.forEach.call(catDDMenu.querySelectorAll('.adm-dd-opt'), function (o) {
      o.classList.toggle('active', o.getAttribute('data-cat') === c);
    });
  }
  if (catDDBtn) catDDBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (catDDMenu && catDDMenu.hidden) openCatDD(); else closeCatDD();
  });
  document.addEventListener('click', function (e) { if (catDD && !catDD.contains(e.target)) closeCatDD(); });

  function populateCategorySelect(platform, selected) {
    if (!catDDMenu) return;
    var cats = CATEGORIES_BY_PLATFORM[platform] || [];
    if (selected && cats.indexOf(selected) < 0) cats = cats.concat([selected]);
    catDDMenu.innerHTML = cats.map(function (c) {
      return '<button type="button" class="adm-dd-opt' + (c === selected ? ' active' : '') + '" data-cat="' + esc(c) + '" role="option" aria-selected="' + (c === selected ? 'true' : 'false') + '"><span>' + esc(c) + '</span><span class="adm-dd-radio"></span></button>';
    }).join('');
    Array.prototype.forEach.call(catDDMenu.querySelectorAll('.adm-dd-opt'), function (o) {
      o.addEventListener('click', function () { setCatValue(o.getAttribute('data-cat')); closeCatDD(); });
    });
    setCatValue(selected || (cats[0] || ''));
  }
  function setEditPlatform(platform, catToKeep) {
    $('admEditPlatform').value = platform;
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-platform') === platform);
    });
    populateCategorySelect(platform, catToKeep);
  }
  function updateDevexHint() {
    var usdPrice = parseFloat($('admEditPrice').value) || 0;
    var hint = $('admEditDevexHint'); if (!hint) return;
    hint.textContent = usdPrice > 0
      ? ('DevEx equivalent of ' + usd(usdPrice) + ' ≈ R$ ' + Math.round(usdPrice / DEVEX_USD_PER_ROBUX).toLocaleString('en-US'))
      : '';
  }
  function renderFileList(listId, files, removeClass) {
    var list = $(listId); if (!list) return;
    list.innerHTML = files.map(function (f, i) {
      var name = typeof f === 'string' ? f : (f.name || '');
      var url = typeof f === 'string' ? null : f.url;
      var nameHtml = url
        ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(name) + '</a>'
        : '<span>' + esc(name) + '</span>';
      return '<div class="adm-file-item">' + nameHtml + '<button type="button" class="adm-icon-btn ' + removeClass + '" data-i="' + i + '">' + ADM_ICON_TRASH + '</button></div>';
    }).join('') || '<p class="adm-empty" style="padding:8px 0;">No files uploaded yet.</p>';
  }
  function renderProofList() { renderFileList('admLegalProofList', editProofFiles, 'adm-proof-remove'); }
  function renderDevProofList() { renderFileList('admLegalDevProofList', editDevProofFiles, 'adm-dev-proof-remove'); }
  function renderGalleryList() {
    var list = $('admEditGalleryList'); if (!list) return;
    list.innerHTML = editGallery.map(function (src, i) {
      return '<div class="adm-gallery-item"><a href="' + esc(src) + '" target="_blank" rel="noopener"><img src="' + esc(src) + '" alt="" /></a><button type="button" class="adm-gallery-remove" data-i="' + i + '">' + ADM_ICON_TRASH + '</button></div>';
    }).join('');
  }
  function updateThumbPreview() {
    var img = $('admEditThumbPreview'); if (!img) return;
    var url = $('admEditThumbUrl').value.trim();
    img.src = url;
    $('admEditThumbEmpty').hidden = !!url;
    $('admEditThumbPreviewWrap').hidden = !url;
  }
  function addThumbFile(file) {
    if (!file) return;
    $('admEditThumbUrl').value = URL.createObjectURL(file);
    updateThumbPreview();
  }
  function addGalleryFiles(files) {
    Array.prototype.forEach.call(files, function (f) { editGallery.push(URL.createObjectURL(f)); });
    renderGalleryList();
  }
  function renderContactList() {
    var list = $('admLegalContactList'); if (!list) return;
    list.innerHTML = editContacts.map(function (c, i) {
      return '<div class="adm-contact-row" data-i="' + i + '">' +
        '<input type="text" class="adm-input adm-contact-label" placeholder="Label (e.g. Discord username)" value="' + esc(c.label || '') + '" />' +
        '<input type="text" class="adm-input adm-contact-value" placeholder="Value" value="' + esc(c.value || '') + '" />' +
        '<button type="button" class="adm-icon-btn adm-contact-remove">' + ADM_ICON_TRASH + '</button></div>';
    }).join('');
  }

  function openProductEdit(id) {
    var p = findProduct(id); if (!p) return;
    $('admEditId').value = p.id;
    $('admEditTitleInput').value = p.title;
    $('admEditPrice').value = p.price;
    $('admEditRobuxPrice').value = p.robuxPrice != null ? p.robuxPrice : '';
    setEditPlatform(p.platform, p.cat);
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) { b.disabled = !p.extra; });
    $('admEditSubtext').value = p.desc || '';
    $('admEditLongDesc').value = p.longDesc || '';
    $('admEditResell').checked = !!p.resell;
    $('admEditResellPrice').value = p.resellPrice != null ? p.resellPrice : '';
    $('admEditResellPriceWrap').hidden = !p.resell;
    $('admEditReleased').checked = !!p.visible;
    $('admEditDeleteBtn').hidden = !p.extra;
    $('admEditHeading').textContent = 'Edit: ' + p.title;
    $('admEditSaveBtn').textContent = 'Save changes';
    $('admEditMsg').textContent = '';
    updateDevexHint();

    var tech = p.tech || {};
    $('admEditTechFormat').value = tech.format || '';
    $('admEditTechSize').value = tech.size || '';
    $('admEditTechFileName').value = tech.fileName || '';
    $('admEditFileInput').value = '';
    var fileNote = $('admEditFileNote');
    fileNote.textContent = tech.fileName ? ('Selected: ' + tech.fileName) : 'Currently: shared placeholder file';
    fileNote.removeAttribute('href');
    $('admEditTechParts').value = tech.parts || '';
    $('admEditTechMeshParts').value = tech.meshParts || '';
    $('admEditTechUnions').value = tech.unions || '';
    $('admEditTechScripts').value = tech.scripts || '';

    $('admEditThumbUrl').value = p.image || '';
    updateThumbPreview();
    editGallery = (p.gallery || []).slice();
    renderGalleryList();
    $('admEditVideoUrl').value = p.video || '';

    var legal = p.legal || defaultLegal();
    $('admLegalTos').value = legal.tos || '';
    editContacts = (legal.contacts || []).map(function (c) { return Object.assign({}, c); });
    editProofFiles = (legal.proofFiles || []).map(function (f) { return typeof f === 'string' ? { name: f, url: null } : f; });
    editDevProofFiles = (legal.devProofFiles || []).map(function (f) { return typeof f === 'string' ? { name: f, url: null } : f; });
    renderContactList(); renderProofList(); renderDevProofList();
    $('admLegalCostAmount').value = legal.licenseCost || 0;
    setCostCurrency(legal.licenseCostCurrency || 'usd');
    $('admLegalPurchasedAt').value = legal.licensePurchasedAt || '';
    $('admLegalMinUsd').value = legal.minSaleUsd || 0;
    $('admLegalMinRobux').value = legal.minSaleRobux || 0;
    $('admLegalCanBeFree').checked = !!legal.canBeFree;
    $('admLegalDisallowSales').checked = !!legal.disallowSales;

    showPanel('product-edit');
  }

  function wireDropzone(dropEl, inputEl, onFiles) {
    if (!dropEl || !inputEl) return;
    dropEl.addEventListener('click', function () { inputEl.click(); });
    inputEl.addEventListener('change', function () { onFiles(inputEl.files); inputEl.value = ''; });
    dropEl.addEventListener('dragover', function (e) { e.preventDefault(); dropEl.classList.add('dragover'); });
    dropEl.addEventListener('dragleave', function () { dropEl.classList.remove('dragover'); });
    dropEl.addEventListener('drop', function (e) {
      e.preventDefault();
      dropEl.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    });
  }

  wireDropzone($('admEditFileDrop'), $('admEditFileInput'), function (files) {
    var f = files[0]; if (!f) return;
    var dot = f.name.lastIndexOf('.');
    $('admEditTechFormat').value = dot >= 0 ? f.name.slice(dot).toLowerCase() : '';
    $('admEditTechSize').value = formatFileSize(f.size);
    $('admEditTechFileName').value = f.name;
    var fileNote = $('admEditFileNote');
    fileNote.textContent = 'Selected: ' + f.name;
    fileNote.href = URL.createObjectURL(f);
  });
  var fileNoteLink = $('admEditFileNote');
  if (fileNoteLink) fileNoteLink.addEventListener('click', function (e) { if (!fileNoteLink.getAttribute('href')) e.preventDefault(); });

  wireDropzone($('admEditThumbDrop'), $('admEditThumbInput'), function (files) { addThumbFile(files[0]); });
  var thumbRemoveBtn = $('admEditThumbRemove');
  if (thumbRemoveBtn) thumbRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    $('admEditThumbUrl').value = '';
    updateThumbPreview();
  });
  var thumbPreviewImg = $('admEditThumbPreview');
  if (thumbPreviewImg) thumbPreviewImg.addEventListener('click', function (e) {
    e.stopPropagation();
    var url = $('admEditThumbUrl').value.trim();
    if (url) window.open(url, '_blank');
  });

  wireDropzone($('admEditGalleryDrop'), $('admEditGalleryInput'), addGalleryFiles);
  var galleryList = $('admEditGalleryList');
  if (galleryList) galleryList.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-gallery-remove'); if (!btn) return;
    editGallery.splice(+btn.getAttribute('data-i'), 1);
    renderGalleryList();
  });

  function setCostCurrency(currency) {
    $('admLegalCostCurrency').value = currency;
    document.querySelectorAll('#admLegalCostCurrencyToggle button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-currency') === currency);
    });
  }
  document.querySelectorAll('#admLegalCostCurrencyToggle button').forEach(function (b) {
    b.addEventListener('click', function () { setCostCurrency(b.getAttribute('data-currency')); });
  });

  document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      setEditPlatform(b.getAttribute('data-platform'), null);
    });
  });
  var editPriceInput = $('admEditPrice');
  if (editPriceInput) editPriceInput.addEventListener('input', updateDevexHint);
  var editResellBox = $('admEditResell');
  if (editResellBox) editResellBox.addEventListener('change', function () { $('admEditResellPriceWrap').hidden = !editResellBox.checked; });

  var contactAddBtn = $('admLegalContactAdd');
  if (contactAddBtn) contactAddBtn.addEventListener('click', function () { editContacts.push({ label: '', value: '' }); renderContactList(); });
  var contactList = $('admLegalContactList');
  if (contactList) {
    contactList.addEventListener('click', function (e) {
      var btn = e.target.closest('.adm-contact-remove'); if (!btn) return;
      var i = +btn.closest('.adm-contact-row').getAttribute('data-i');
      editContacts.splice(i, 1); renderContactList();
    });
    contactList.addEventListener('input', function (e) {
      var row = e.target.closest('.adm-contact-row'); if (!row) return;
      var i = +row.getAttribute('data-i');
      if (!editContacts[i]) return;
      if (e.target.classList.contains('adm-contact-label')) editContacts[i].label = e.target.value;
      else if (e.target.classList.contains('adm-contact-value')) editContacts[i].value = e.target.value;
    });
  }

  wireDropzone($('admLegalProofDrop'), $('admLegalProofInput'), function (files) {
    Array.prototype.forEach.call(files, function (f) { editProofFiles.push({ name: f.name, url: URL.createObjectURL(f) }); });
    renderProofList();
  });
  var proofList = $('admLegalProofList');
  if (proofList) proofList.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-proof-remove'); if (!btn) return;
    editProofFiles.splice(+btn.getAttribute('data-i'), 1);
    renderProofList();
  });

  wireDropzone($('admLegalDevProofDrop'), $('admLegalDevProofInput'), function (files) {
    Array.prototype.forEach.call(files, function (f) { editDevProofFiles.push({ name: f.name, url: URL.createObjectURL(f) }); });
    renderDevProofList();
  });
  var devProofList = $('admLegalDevProofList');
  if (devProofList) devProofList.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-dev-proof-remove'); if (!btn) return;
    editDevProofFiles.splice(+btn.getAttribute('data-i'), 1);
    renderDevProofList();
  });

  function openProductCreate() {
    $('admEditId').value = '';
    $('admEditTitleInput').value = '';
    $('admEditPrice').value = 0;
    $('admEditRobuxPrice').value = '';
    setEditPlatform('Roblox', null);
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) { b.disabled = false; });
    $('admEditSubtext').value = '';
    $('admEditLongDesc').value = '';
    $('admEditResell').checked = false;
    $('admEditResellPrice').value = '';
    $('admEditResellPriceWrap').hidden = true;
    $('admEditReleased').checked = false;
    $('admEditDeleteBtn').hidden = true;
    $('admEditHeading').textContent = 'Create new product';
    $('admEditSaveBtn').textContent = 'Create product';
    $('admEditMsg').textContent = '';
    updateDevexHint();

    ['admEditTechFormat', 'admEditTechSize', 'admEditTechFileName', 'admEditTechParts', 'admEditTechMeshParts', 'admEditTechUnions', 'admEditTechScripts'].forEach(function (id) { $(id).value = ''; });
    $('admEditFileInput').value = '';
    $('admEditFileNote').textContent = 'Currently: shared placeholder file';
    $('admEditFileNote').removeAttribute('href');

    $('admEditThumbUrl').value = '';
    updateThumbPreview();
    editGallery = [];
    renderGalleryList();
    $('admEditVideoUrl').value = '';

    $('admLegalTos').value = '';
    editContacts = []; editProofFiles = []; editDevProofFiles = [];
    renderContactList(); renderProofList(); renderDevProofList();
    $('admLegalCostAmount').value = 0;
    setCostCurrency('usd');
    $('admLegalPurchasedAt').value = '';
    $('admLegalMinUsd').value = 0;
    $('admLegalMinRobux').value = 0;
    $('admLegalCanBeFree').checked = false;
    $('admLegalDisallowSales').checked = false;

    showPanel('product-edit');
  }
  var createBtn = $('admOpenCreatePanel');
  if (createBtn) createBtn.addEventListener('click', function () { if (can('admin')) openProductCreate(); });

  function collectEditFields() {
    return {
      price: Math.max(0, parseFloat($('admEditPrice').value) || 0),
      robuxPrice: $('admEditRobuxPrice').value === '' ? null : Math.max(0, parseFloat($('admEditRobuxPrice').value) || 0),
      cat: $('admEditCat').value,
      desc: $('admEditSubtext').value.trim(),
      longDesc: $('admEditLongDesc').value.trim(),
      resell: $('admEditResell').checked,
      resellPrice: $('admEditResell').checked && $('admEditResellPrice').value !== '' ? Math.max(0, parseFloat($('admEditResellPrice').value) || 0) : null,
      visible: $('admEditReleased').checked,
      image: $('admEditThumbUrl').value.trim(),
      gallery: editGallery.slice(),
      video: toYouTubeEmbed($('admEditVideoUrl').value.trim()),
      tech: {
        format: $('admEditTechFormat').value.trim(),
        size: $('admEditTechSize').value.trim(),
        fileName: $('admEditTechFileName').value,
        parts: $('admEditTechParts').value,
        meshParts: $('admEditTechMeshParts').value,
        unions: $('admEditTechUnions').value,
        scripts: $('admEditTechScripts').value
      },
      legal: {
        tos: $('admLegalTos').value.trim(),
        proofFiles: editProofFiles.slice(),
        devProofFiles: editDevProofFiles.slice(),
        contacts: editContacts.filter(function (c) { return c.label || c.value; }),
        licenseCost: Math.max(0, parseFloat($('admLegalCostAmount').value) || 0),
        licenseCostCurrency: $('admLegalCostCurrency').value,
        licensePurchasedAt: $('admLegalPurchasedAt').value,
        minSaleUsd: Math.max(0, parseFloat($('admLegalMinUsd').value) || 0),
        minSaleRobux: Math.max(0, parseFloat($('admLegalMinRobux').value) || 0),
        canBeFree: $('admLegalCanBeFree').checked,
        disallowSales: $('admLegalDisallowSales').checked
      }
    };
  }

  var editForm = $('admEditForm');
  if (editForm) editForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var id = $('admEditId').value;
    var isCreate = !id;
    var platform = $('admEditPlatform').value;
    var msg = $('admEditMsg');

    if (isCreate) {
      var title = $('admEditTitleInput').value.trim();
      if (!title) { if (msg) msg.textContent = 'Enter a title.'; return; }
      var fields = Object.assign({ title: title }, collectEditFields());
      if (!fields.image) fields.image = 'banner.jpg';
      var newId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
      EXTRA_PRODUCTS.push(Object.assign({
        id: newId, platform: platform,
        page: platform === 'Minecraft' ? 'minecraft.html' : 'assets.html',
        priceNum: fields.price, rating: 0, reviews: 0, versions: []
      }, fields));
      saveExtraProducts();
      logAudit('Created product "' + title + '"');
      openProductEdit(newId);
      if (msg) msg.textContent = 'Created.';
      renderProducts();
      return;
    }

    var p = findProduct(id); if (!p) return;
    var fields = Object.assign({ title: $('admEditTitleInput').value.trim() || p.title }, collectEditFields());
    if (p.extra) fields.platform = platform;
    saveProductFields(id, p.extra, fields);
    logAudit('Updated product "' + fields.title + '"');
    if (msg) msg.textContent = 'Saved.';
    renderProducts();
  });
  var editDeleteBtn = $('admEditDeleteBtn');
  if (editDeleteBtn) editDeleteBtn.addEventListener('click', function () {
    if (!can('admin')) return;
    var id = $('admEditId').value;
    var p = findProduct(id); if (!p) return;
    if (!confirm('Delete "' + p.title + '"? This can\'t be undone.')) return;
    EXTRA_PRODUCTS = EXTRA_PRODUCTS.filter(function (x) { return x.id !== id; });
    saveExtraProducts();
    logAudit('Deleted admin-only product "' + p.title + '"');
    showPanel('products');
  });

  /* ================================================================
     PRODUCT UPDATE PANEL (version/changelog/file pushes)
     ================================================================ */
  var updSelectedId = null;

  function openUpdatePanel() {
    updSelectedId = null;
    var search = $('admUpdSearch'); if (search) search.value = '';
    $('admUpdResults').innerHTML = '';
    $('admUpdSelected').hidden = true;
    showPanel('product-update');
  }
  var openUpdateBtn = $('admOpenUpdatePanel');
  if (openUpdateBtn) openUpdateBtn.addEventListener('click', openUpdatePanel);

  function renderUpdResults() {
    var q = ($('admUpdSearch').value || '').trim().toLowerCase();
    var results = $('admUpdResults');
    if (!q) { results.innerHTML = ''; return; }
    var matches = allProducts().filter(function (p) { return p.title.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    results.innerHTML = matches.map(function (p) {
      return '<button type="button" class="adm-upd-result" data-id="' + esc(p.id) + '">' +
        '<span class="dr-thumb" style="width:36px;height:26px;border-radius:6px;flex:0 0 auto;background-image:url(\'' + p.image + '\')"></span>' +
        '<span>' + esc(p.title) + '</span></button>';
    }).join('') || '<p class="adm-empty" style="padding:8px 0;">No products match.</p>';
  }
  var updSearchInput = $('admUpdSearch');
  if (updSearchInput) updSearchInput.addEventListener('input', renderUpdResults);

  function renderUpdHistory(p) {
    var box = $('admUpdHistory'); if (!box) return;
    var versions = (p.versions || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    box.innerHTML = '<div class="dash-card-head"><h2>Version history</h2></div>' + (versions.map(function (v) {
      return '<div class="adm-ver-item"><span class="adm-ver-num">' + esc(v.version) + '</span>' +
        '<span class="adm-ver-date">' + fmtDate(new Date(v.date)) + '</span>' +
        '<span class="adm-ver-note">' + esc(v.changelog) + '</span></div>';
    }).join('') || '<p class="adm-empty">No versions pushed yet.</p>');
  }

  function selectUpdateProduct(id) {
    var p = findProduct(id); if (!p) return;
    updSelectedId = id;
    $('admUpdThumb').style.backgroundImage = "url('" + p.image + "')";
    $('admUpdSelectedName').textContent = p.title;
    $('admUpdVersion').value = '';
    $('admUpdChangelog').value = '';
    $('admUpdDescWrap').hidden = true;
    $('admUpdDescInput').value = '';
    $('admUpdMsg').textContent = '';
    $('admUpdResults').innerHTML = '';
    $('admUpdSearch').value = p.title;
    $('admUpdSelected').hidden = false;
    renderUpdHistory(p);
  }
  var updResults = $('admUpdResults');
  if (updResults) updResults.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-upd-result'); if (!btn) return;
    selectUpdateProduct(btn.getAttribute('data-id'));
  });
  var updChangeBtn = $('admUpdChange');
  if (updChangeBtn) updChangeBtn.addEventListener('click', openUpdatePanel);

  var updDescToggle = $('admUpdDescToggle');
  if (updDescToggle) updDescToggle.addEventListener('click', function () {
    var wrap = $('admUpdDescWrap');
    var opening = wrap.hidden;
    wrap.hidden = !opening;
    if (opening && updSelectedId) {
      var p = findProduct(updSelectedId);
      $('admUpdDescInput').value = (p && p.longDesc) || '';
    }
  });

  var updSubmitBtn = $('admUpdSubmit');
  if (updSubmitBtn) updSubmitBtn.addEventListener('click', function () {
    if (!can('admin')) return;
    if (!updSelectedId) return;
    var p = findProduct(updSelectedId); if (!p) return;
    var version = $('admUpdVersion').value.trim();
    var changelog = $('admUpdChangelog').value.trim();
    var msg = $('admUpdMsg');
    if (!version || !changelog) { if (msg) msg.textContent = 'Enter a version number and changelog.'; return; }

    var versions = (p.versions || []).slice();
    versions.push({ version: version, changelog: changelog, date: new Date().toISOString() });
    var fields = { versions: versions };
    if (!$('admUpdDescWrap').hidden) fields.longDesc = $('admUpdDescInput').value.trim();

    saveProductFields(updSelectedId, p.extra, fields);
    logAudit('Pushed update ' + version + ' for "' + p.title + '"');
    if (msg) msg.textContent = 'Update pushed.';
    $('admUpdVersion').value = '';
    $('admUpdChangelog').value = '';
    renderUpdHistory(findProduct(updSelectedId));
    renderProducts();
  });

  /* ================================================================
     ORDERS PANEL
     ================================================================ */
  function renderOrders() {
    var statusF = ($('admOrderStatusFilter') || {}).value || 'all';
    var q = (($('admOrderSearch') || {}).value || '').trim().toLowerCase();
    var rows = ORDERS.filter(function (o) {
      var okStatus = statusF === 'all' || o.status === statusF;
      var okQ = !q || o.id.toLowerCase().indexOf(q) >= 0 || o.title.toLowerCase().indexOf(q) >= 0 || o.userName.toLowerCase().indexOf(q) >= 0;
      return okStatus && okQ;
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 200);
    $('admOrdersBody').innerHTML = rows.map(function (o) {
      var actions = '';
      if (o.status === 'pending' && can('support')) actions += '<button class="btn btn-ghost adm-btn-sm adm-order-complete" type="button">Mark completed</button>';
      if (o.status === 'completed' && can('support')) actions += '<button class="btn btn-ghost adm-btn-sm adm-order-refund" type="button">Refund</button>';
      return '<tr data-id="' + esc(o.id) + '">' +
        '<td>' + fmtDate(new Date(o.date)) + '</td>' +
        '<td class="dt-mono">' + esc(o.id) + '</td>' +
        '<td>' + esc(o.title) + (o.licence === 'resell' ? ' <span class="adm-sub">· resell</span>' : '') + '</td>' +
        '<td>' + esc(o.userName) + '</td>' +
        '<td>' + o.currency.toUpperCase() + '</td>' +
        '<td>' + usd(o.total) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="adm-row-actions">' + actions + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="adm-empty">No orders match.</td></tr>';
  }
  var ordersBody = $('admOrdersBody');
  if (ordersBody) ordersBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var o = ORDERS.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    if (e.target.classList.contains('adm-order-complete')) {
      if (!can('support')) return;
      o.status = 'completed'; saveOrders(); logAudit('Marked order ' + id + ' completed');
      renderOrders(); if (curPanel === 'home') renderHome();
    } else if (e.target.classList.contains('adm-order-refund')) {
      if (!can('support')) return;
      o.status = 'refunded'; o.refundReason = o.refundReason || 'Manual refund by staff';
      saveOrders(); logAudit('Refunded order ' + id + ' (' + usd(o.total) + ')');
      renderOrders(); renderRefunds();
    }
  });
  ['admOrderStatusFilter', 'admOrderSearch'].forEach(function (id) {
    var elx = $(id); if (elx) elx.addEventListener('input', renderOrders);
  });

  /* ================================================================
     REFUNDS PANEL
     ================================================================ */
  function renderRefunds() {
    var refunded = ORDERS.filter(function (o) { return o.status === 'refunded'; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    $('admRefundStats').innerHTML =
      '<div class="dash-stat glass"><span class="ds-label">Refunded orders</span><span class="ds-num">' + refunded.length + '</span></div>' +
      '<div class="dash-stat glass"><span class="ds-label">Total refunded</span><span class="ds-num">' + usd(refunded.reduce(function (s, o) { return s + o.total; }, 0)) + '</span></div>';
    $('admRefundsBody').innerHTML = refunded.map(function (o) {
      return '<tr><td>' + fmtDate(new Date(o.date)) + '</td><td class="dt-mono">' + esc(o.id) + '</td><td>' + esc(o.title) + '</td><td>' + esc(o.userName) + '</td><td>' + usd(o.total) + '</td><td>' + esc(o.refundReason || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No refunds yet.</td></tr>';

    var pending = ORDERS.filter(function (o) { return o.status === 'completed'; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 30);
    $('admRefundEligible').innerHTML = pending.map(function (o) {
      return '<tr data-id="' + esc(o.id) + '"><td>' + fmtDate(new Date(o.date)) + '</td><td class="dt-mono">' + esc(o.id) + '</td><td>' + esc(o.title) + '</td><td>' + esc(o.userName) + '</td><td>' + usd(o.total) + '</td>' +
        '<td class="adm-row-actions">' + (can('support') ? '<button class="btn btn-ghost adm-btn-sm adm-refund-issue" type="button">Issue refund</button>' : '<span class="adm-sub">No permission</span>') + '</td></tr>';
    }).join('');
  }
  var refundEligible = $('admRefundEligible');
  if (refundEligible) refundEligible.addEventListener('click', function (e) {
    if (!e.target.classList.contains('adm-refund-issue')) return;
    if (!can('support')) return;
    var tr = e.target.closest('tr'); var id = tr.getAttribute('data-id');
    var o = ORDERS.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var reason = prompt('Refund reason for ' + id + ':', 'Requested by customer') || 'Requested by customer';
    o.status = 'refunded'; o.refundReason = reason;
    saveOrders(); logAudit('Issued refund for ' + id + ' — ' + reason);
    renderRefunds(); renderOrders();
  });

  /* ================================================================
     REVIEWS PANEL
     ================================================================ */
  function renderReviews() {
    var f = ($('admReviewFilter') || {}).value || 'pending';
    var rows = REVIEWS.filter(function (r) { return f === 'all' || r.status === f; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    $('admReviewsList').innerHTML = rows.map(function (r) {
      var stars = '';
      for (var i = 0; i < 5; i++) stars += '<span class="pd-star ' + (i < r.stars ? 'on' : '') + '">' + (i < r.stars ? '★' : '☆') + '</span>';
      return '<div class="dash-card glass adm-review" data-id="' + r.id + '">' +
        '<div class="adm-review-head"><strong>' + esc(r.user) + '</strong><span class="adm-sub">on ' + esc(r.productTitle) + '</span><span class="adm-sub">' + fmtDate(new Date(r.date)) + '</span>' + statusBadge(r.status === 'approved' ? 'completed' : (r.status === 'hidden' ? 'refunded' : 'pending')) + '</div>' +
        '<div class="pd-rev-stars">' + stars + '</div>' +
        '<p class="adm-review-text">' + esc(r.text) + '</p>' +
        '<div class="adm-row-actions">' +
          (r.status !== 'approved' ? '<button class="btn btn-ghost adm-btn-sm adm-rev-approve" type="button">Approve</button>' : '') +
          (r.status !== 'hidden' ? '<button class="btn btn-ghost adm-btn-sm adm-rev-hide" type="button">Hide</button>' : '') +
        '</div></div>';
    }).join('') || '<p class="adm-empty">Nothing here.</p>';
  }
  var reviewsList = $('admReviewsList');
  if (reviewsList) reviewsList.addEventListener('click', function (e) {
    var card = e.target.closest('.adm-review'); if (!card) return;
    var id = card.getAttribute('data-id');
    var r = REVIEWS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (e.target.classList.contains('adm-rev-approve')) { r.status = 'approved'; logAudit('Approved review by ' + r.user + ' on "' + r.productTitle + '"'); }
    else if (e.target.classList.contains('adm-rev-hide')) { r.status = 'hidden'; logAudit('Hid review by ' + r.user + ' on "' + r.productTitle + '"'); }
    else return;
    saveReviews(); renderReviews();
  });
  var reviewFilter = $('admReviewFilter');
  if (reviewFilter) reviewFilter.addEventListener('change', renderReviews);

  /* ================================================================
     USERS PANEL (+ manual product grants)
     ================================================================ */
  function userSpend(userId) {
    return ORDERS.filter(function (o) { return o.userId === userId && o.status === 'completed'; }).reduce(function (s, o) { return s + o.total; }, 0);
  }
  function userOrderCount(userId) { return ORDERS.filter(function (o) { return o.userId === userId; }).length; }
  function renderUsers() {
    var q = (($('admUserSearch') || {}).value || '').trim().toLowerCase();
    var rows = USERS.filter(function (u) { return !q || u.name.toLowerCase().indexOf(q) >= 0 || u.email.toLowerCase().indexOf(q) >= 0; });
    $('admUsersBody').innerHTML = rows.map(function (u) {
      return '<tr data-id="' + u.id + '"><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + fmtDate(new Date(u.joined)) + '</td><td>' + userOrderCount(u.id) + '</td><td>' + usd(userSpend(u.id)) + '</td>' +
        '<td>' + (u.status === 'active' ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Banned</span>') + '</td>' +
        '<td class="adm-row-actions">' +
          (can('admin') ? '<button class="btn btn-ghost adm-btn-sm adm-user-ban" type="button">' + (u.status === 'active' ? 'Ban' : 'Unban') + '</button>' : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No users match.</td></tr>';

    var sel = $('admGrantUser');
    if (sel) sel.innerHTML = USERS.map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('');
    var psel = $('admGrantProduct');
    if (psel) psel.innerHTML = allProducts().map(function (p) { return '<option value="' + p.id + '">' + esc(p.title) + '</option>'; }).join('');
  }
  var usersBody = $('admUsersBody');
  if (usersBody) usersBody.addEventListener('click', function (e) {
    if (!e.target.classList.contains('adm-user-ban')) return;
    if (!can('admin')) return;
    var tr = e.target.closest('tr'); var id = tr.getAttribute('data-id');
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    u.status = u.status === 'active' ? 'banned' : 'active';
    saveUsers(); logAudit((u.status === 'banned' ? 'Banned' : 'Unbanned') + ' user ' + u.name);
    renderUsers();
  });
  var userSearch = $('admUserSearch');
  if (userSearch) userSearch.addEventListener('input', renderUsers);

  var grantForm = $('admGrantForm');
  if (grantForm) grantForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('support')) return;
    var userId = $('admGrantUser').value, prodId = $('admGrantProduct').value;
    var u = USERS.filter(function (x) { return x.id === userId; })[0];
    var p = findProduct(prodId);
    if (!u || !p) return;
    ORDERS.unshift({
      id: 'CLD-GRANT-' + Date.now().toString(36).toUpperCase(),
      date: new Date().toISOString(), userId: u.id, userName: u.name,
      productId: p.id, title: p.title, image: p.image, cat: p.cat, platform: p.platform,
      licence: 'standard', qty: 1, unitPrice: 0, subtotal: 0, couponCode: null, discount: 0, total: 0,
      currency: 'usd', status: 'completed', refCode: null, refundReason: null, granted: true
    });
    saveOrders();
    logAudit('Manually granted "' + p.title + '" to ' + u.name);
    var msg = $('admGrantMsg'); if (msg) { msg.textContent = 'Granted "' + p.title + '" to ' + u.name + '.'; setTimeout(function () { msg.textContent = ''; }, 3000); }
    renderUsers(); if (curPanel === 'orders') renderOrders();
  });

  /* ================================================================
     COUPONS PANEL
     ================================================================ */
  function renderCoupons() {
    var cs = couponStats();
    $('admCouponsBody').innerHTML = COUPONS.map(function (c, i) {
      var stat = cs.filter(function (x) { return x.code === c.code; })[0] || { uses: 0, discountGiven: 0 };
      return '<tr data-code="' + esc(c.code) + '"><td class="dt-mono">' + esc(c.code) + '</td><td>' + (c.type === 'pct' ? c.val + '%' : usd(c.val)) + '</td><td>' + stat.uses + (c.limit ? ' / ' + c.limit : '') + '</td><td>' + usd(stat.discountGiven) + '</td>' +
        '<td>' + (c.active ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Inactive</span>') + '</td>' +
        '<td class="adm-row-actions">' + (can('admin') ? '<button class="btn btn-ghost adm-btn-sm adm-coupon-toggle" type="button">' + (c.active ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-ghost adm-btn-sm adm-coupon-del" type="button">Delete</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No coupons yet.</td></tr>';
  }
  var couponsBody = $('admCouponsBody');
  if (couponsBody) couponsBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var code = tr.getAttribute('data-code');
    var c = COUPONS.filter(function (x) { return x.code === code; })[0]; if (!c) return;
    if (e.target.classList.contains('adm-coupon-toggle')) {
      if (!can('admin')) return;
      c.active = !c.active; saveCoupons(); logAudit((c.active ? 'Activated' : 'Deactivated') + ' coupon ' + code); renderCoupons();
    } else if (e.target.classList.contains('adm-coupon-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete coupon ' + code + '? This can\'t be undone.')) return;
      COUPONS = COUPONS.filter(function (x) { return x.code !== code; });
      saveCoupons(); logAudit('Deleted coupon ' + code); renderCoupons();
    }
  });
  var addCouponForm = $('admAddCouponForm');
  if (addCouponForm) addCouponForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var code = $('admNewCouponCode').value.trim().toUpperCase();
    var type = $('admNewCouponType').value;
    var val = parseFloat($('admNewCouponVal').value) || 0;
    var limit = parseInt($('admNewCouponLimit').value, 10) || null;
    if (!code || !val) return;
    if (COUPONS.some(function (c) { return c.code === code; })) { alert('Coupon code already exists.'); return; }
    COUPONS.push({ code: code, type: type, val: val, active: true, limit: limit });
    saveCoupons(); logAudit('Created coupon ' + code);
    addCouponForm.reset(); renderCoupons();
  });

  /* ================================================================
     BLOG POSTS PANEL
     ================================================================ */
  var POSTS = seedIfEmpty('coldd_admin_posts_v1', function () { return (window.__POSTS || []).slice(); });
  function savePosts() { lsSet('coldd_admin_posts_v1', POSTS); }
  function renderPosts() {
    var q = ($('admPostSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var rows = POSTS.filter(function (p) { return !q || p.title.toLowerCase().indexOf(q) >= 0; });
    $('admPostBody').innerHTML = rows.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td>' + esc(p.title) + '</td>' +
        '<td>' + esc(p.category) + '</td>' +
        '<td>' + esc(p.author) + '</td>' +
        '<td>' + esc(p.date) + '</td>' +
        '<td>' + (p.visible ? '<span class="dt-badge ok">Published</span>' : '<span class="dt-badge err">Draft</span>') + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="btn btn-ghost adm-btn-sm adm-post-edit" type="button"' + (can('admin') ? '' : ' disabled') + '>Edit</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-post-toggle" type="button"' + (can('admin') ? '' : ' disabled') + '>' + (p.visible ? 'Unpublish' : 'Publish') + '</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-post-del" type="button"' + (can('admin') ? '' : ' disabled') + '>Delete</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No posts yet.</td></tr>';
  }
  function fillPostForm(p) {
    $('admPostEditId').value = p.id;
    $('admNewPostTitle').value = p.title;
    $('admNewPostCategory').value = p.category;
    $('admNewPostAuthor').value = p.author;
    $('admNewPostDate').value = p.date;
    $('admNewPostRead').value = p.readMins;
    $('admNewPostCover').value = p.cover;
    $('admNewPostDek').value = p.dek;
    $('admNewPostBody').value = p.body;
    $('admNewPostPublished').checked = p.visible;
    $('admPostFormTitle').textContent = 'Edit post';
    $('admPostFormSubmit').textContent = 'Save changes';
    $('admPostFormCancel').hidden = false;
  }
  function resetPostForm() {
    $('admAddPostForm').reset();
    $('admPostEditId').value = '';
    $('admPostFormTitle').textContent = 'Add post';
    $('admPostFormSubmit').textContent = 'Add post';
    $('admPostFormCancel').hidden = true;
  }
  var postBody = $('admPostBody');
  if (postBody) postBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var p = POSTS.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (e.target.classList.contains('adm-post-edit')) {
      if (!can('admin')) return;
      fillPostForm(p);
    } else if (e.target.classList.contains('adm-post-toggle')) {
      if (!can('admin')) return;
      p.visible = !p.visible; savePosts(); logAudit((p.visible ? 'Published' : 'Unpublished') + ' post "' + p.title + '"'); renderPosts();
    } else if (e.target.classList.contains('adm-post-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + p.title + '"? This can\'t be undone.')) return;
      POSTS = POSTS.filter(function (x) { return x.id !== id; });
      savePosts(); logAudit('Deleted post "' + p.title + '"'); renderPosts();
    }
  });
  var postSearch = $('admPostSearch');
  if (postSearch) postSearch.addEventListener('input', renderPosts);
  var postCancelBtn = $('admPostFormCancel');
  if (postCancelBtn) postCancelBtn.addEventListener('click', resetPostForm);
  var addPostForm = $('admAddPostForm');
  if (addPostForm) addPostForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var title = $('admNewPostTitle').value.trim();
    if (!title) return;
    var editId = $('admPostEditId').value;
    var data = {
      title: title,
      category: $('admNewPostCategory').value,
      author: $('admNewPostAuthor').value.trim() || 'coldd',
      date: $('admNewPostDate').value,
      readMins: parseInt($('admNewPostRead').value, 10) || 5,
      cover: $('admNewPostCover').value.trim() || 'banner.jpg',
      dek: $('admNewPostDek').value.trim(),
      body: $('admNewPostBody').value,
      visible: $('admNewPostPublished').checked
    };
    if (editId) {
      var existing = POSTS.filter(function (x) { return x.id === editId; })[0];
      if (existing) { Object.assign(existing, data); logAudit('Edited post "' + title + '"'); }
    } else {
      var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      data.id = slug + '-' + Date.now().toString(36);
      data.slug = slug; data.tags = []; data.featured = false;
      POSTS.push(data);
      logAudit('Added post "' + title + '"');
    }
    savePosts();
    resetPostForm();
    renderPosts();
  });

  /* ================================================================
     TUTORIALS PANEL
     ================================================================ */
  var TUTORIALS = seedIfEmpty('coldd_admin_tutorials_v1', function () { return (window.__TUTORIALS || []).slice(); });
  function saveTutorials() { lsSet('coldd_admin_tutorials_v1', TUTORIALS); }
  function renderTutorials() {
    var q = ($('admTutSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var rows = TUTORIALS.filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) >= 0; });
    $('admTutBody').innerHTML = rows.map(function (t) {
      return '<tr data-id="' + esc(t.id) + '">' +
        '<td>' + esc(t.title) + '</td>' +
        '<td>' + esc(t.track) + '</td>' +
        '<td>' + esc(t.difficulty) + '</td>' +
        '<td>' + esc(t.platform) + '</td>' +
        '<td>' + t.order + '</td>' +
        '<td>' + (t.visible ? '<span class="dt-badge ok">Published</span>' : '<span class="dt-badge err">Draft</span>') + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="btn btn-ghost adm-btn-sm adm-tut-edit" type="button"' + (can('admin') ? '' : ' disabled') + '>Edit</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-tut-toggle" type="button"' + (can('admin') ? '' : ' disabled') + '>' + (t.visible ? 'Unpublish' : 'Publish') + '</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-tut-del" type="button"' + (can('admin') ? '' : ' disabled') + '>Delete</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No tutorials yet.</td></tr>';
  }
  function fillTutForm(t) {
    $('admTutEditId').value = t.id;
    $('admNewTutTitle').value = t.title;
    $('admNewTutTrack').value = t.track;
    $('admNewTutDifficulty').value = t.difficulty;
    $('admNewTutPlatform').value = t.platform;
    $('admNewTutOrder').value = t.order;
    $('admNewTutMins').value = t.estMins;
    $('admNewTutCover').value = t.cover;
    $('admNewTutVideo').value = t.video || '';
    $('admNewTutSummary').value = t.summary;
    $('admNewTutBody').value = t.body;
    $('admNewTutPublished').checked = t.visible;
    $('admTutFormTitle').textContent = 'Edit tutorial';
    $('admTutFormSubmit').textContent = 'Save changes';
    $('admTutFormCancel').hidden = false;
  }
  function resetTutForm() {
    $('admAddTutForm').reset();
    $('admTutEditId').value = '';
    $('admTutFormTitle').textContent = 'Add tutorial';
    $('admTutFormSubmit').textContent = 'Add tutorial';
    $('admTutFormCancel').hidden = true;
  }
  var tutBody = $('admTutBody');
  if (tutBody) tutBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var t = TUTORIALS.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (e.target.classList.contains('adm-tut-edit')) {
      if (!can('admin')) return;
      fillTutForm(t);
    } else if (e.target.classList.contains('adm-tut-toggle')) {
      if (!can('admin')) return;
      t.visible = !t.visible; saveTutorials(); logAudit((t.visible ? 'Published' : 'Unpublished') + ' tutorial "' + t.title + '"'); renderTutorials();
    } else if (e.target.classList.contains('adm-tut-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + t.title + '"? This can\'t be undone.')) return;
      TUTORIALS = TUTORIALS.filter(function (x) { return x.id !== id; });
      saveTutorials(); logAudit('Deleted tutorial "' + t.title + '"'); renderTutorials();
    }
  });
  var tutSearch = $('admTutSearch');
  if (tutSearch) tutSearch.addEventListener('input', renderTutorials);
  var tutCancelBtn = $('admTutFormCancel');
  if (tutCancelBtn) tutCancelBtn.addEventListener('click', resetTutForm);
  var addTutForm = $('admAddTutForm');
  if (addTutForm) addTutForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var title = $('admNewTutTitle').value.trim();
    if (!title) return;
    var editId = $('admTutEditId').value;
    var data = {
      title: title,
      track: $('admNewTutTrack').value,
      difficulty: $('admNewTutDifficulty').value,
      platform: $('admNewTutPlatform').value,
      order: parseInt($('admNewTutOrder').value, 10) || 1,
      estMins: parseInt($('admNewTutMins').value, 10) || 10,
      cover: $('admNewTutCover').value.trim() || 'scripts.jpg',
      video: $('admNewTutVideo').value.trim(),
      summary: $('admNewTutSummary').value.trim(),
      body: $('admNewTutBody').value,
      visible: $('admNewTutPublished').checked
    };
    if (editId) {
      var existing = TUTORIALS.filter(function (x) { return x.id === editId; })[0];
      if (existing) { Object.assign(existing, data); logAudit('Edited tutorial "' + title + '"'); }
    } else {
      var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      data.id = slug + '-' + Date.now().toString(36);
      data.slug = slug;
      TUTORIALS.push(data);
      logAudit('Added tutorial "' + title + '"');
    }
    saveTutorials();
    resetTutForm();
    renderTutorials();
  });

  /* ================================================================
     RELEASES PANEL
     ================================================================ */
  var RELEASES = seedIfEmpty('coldd_admin_releases_v1', function () { return (window.__RELEASES || []).slice(); });
  function saveReleases() { lsSet('coldd_admin_releases_v1', RELEASES); }
  function renderReleases() {
    var q = ($('admRelSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var rows = RELEASES.filter(function (r) { return !q || r.title.toLowerCase().indexOf(q) >= 0; });
    $('admRelBody').innerHTML = rows.map(function (r) {
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td class="dt-mono">' + esc(r.version || '—') + '</td>' +
        '<td>' + esc(r.kind) + '</td>' +
        '<td>' + esc(r.title) + '</td>' +
        '<td>' + esc(r.date) + '</td>' +
        '<td>' + (r.visible ? '<span class="dt-badge ok">Published</span>' : '<span class="dt-badge err">Draft</span>') + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="btn btn-ghost adm-btn-sm adm-rel-edit" type="button"' + (can('admin') ? '' : ' disabled') + '>Edit</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-rel-toggle" type="button"' + (can('admin') ? '' : ' disabled') + '>' + (r.visible ? 'Unpublish' : 'Publish') + '</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-rel-del" type="button"' + (can('admin') ? '' : ' disabled') + '>Delete</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No releases yet.</td></tr>';
  }
  function fillRelForm(r) {
    $('admRelEditId').value = r.id;
    $('admNewRelVersion').value = r.version || '';
    $('admNewRelKind').value = r.kind;
    $('admNewRelTitle').value = r.title;
    $('admNewRelDate').value = r.date;
    $('admNewRelAffects').value = (r.affects || []).join(', ');
    $('admNewRelSummary').value = r.summary;
    $('admNewRelPublished').checked = r.visible;
    $('admRelFormTitle').textContent = 'Edit release';
    $('admRelFormSubmit').textContent = 'Save changes';
    $('admRelFormCancel').hidden = false;
  }
  function resetRelForm() {
    $('admAddRelForm').reset();
    $('admRelEditId').value = '';
    $('admRelFormTitle').textContent = 'Add release';
    $('admRelFormSubmit').textContent = 'Add release';
    $('admRelFormCancel').hidden = true;
  }
  var relBody = $('admRelBody');
  if (relBody) relBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var r = RELEASES.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (e.target.classList.contains('adm-rel-edit')) {
      if (!can('admin')) return;
      fillRelForm(r);
    } else if (e.target.classList.contains('adm-rel-toggle')) {
      if (!can('admin')) return;
      r.visible = !r.visible; saveReleases(); logAudit((r.visible ? 'Published' : 'Unpublished') + ' release "' + r.title + '"'); renderReleases();
    } else if (e.target.classList.contains('adm-rel-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + r.title + '"? This can\'t be undone.')) return;
      RELEASES = RELEASES.filter(function (x) { return x.id !== id; });
      saveReleases(); logAudit('Deleted release "' + r.title + '"'); renderReleases();
    }
  });
  var relSearch = $('admRelSearch');
  if (relSearch) relSearch.addEventListener('input', renderReleases);
  var relCancelBtn = $('admRelFormCancel');
  if (relCancelBtn) relCancelBtn.addEventListener('click', resetRelForm);
  var addRelForm = $('admAddRelForm');
  if (addRelForm) addRelForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var title = $('admNewRelTitle').value.trim();
    if (!title) return;
    var editId = $('admRelEditId').value;
    var data = {
      version: $('admNewRelVersion').value.trim(),
      kind: $('admNewRelKind').value,
      title: title,
      date: $('admNewRelDate').value,
      affects: $('admNewRelAffects').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      summary: $('admNewRelSummary').value.trim(),
      details: '',
      visible: $('admNewRelPublished').checked
    };
    if (editId) {
      var existing = RELEASES.filter(function (x) { return x.id === editId; })[0];
      if (existing) { Object.assign(existing, data); logAudit('Edited release "' + title + '"'); }
    } else {
      data.id = 'rel-' + Date.now().toString(36);
      RELEASES.push(data);
      logAudit('Added release "' + title + '"');
    }
    saveReleases();
    resetRelForm();
    renderReleases();
  });

  /* ================================================================
     STAFF PANEL (roles + whitelist management)
     ================================================================ */
  function renderStaff() {
    $('admStaffBody').innerHTML = STAFF.map(function (s) {
      return '<tr data-id="' + s.id + '"><td>' + esc(s.name) + '</td><td class="dt-mono">' + esc(s.discordId || '—') + '</td>' +
        '<td><select class="adm-staff-role"' + (can('owner') ? '' : ' disabled') + '>' +
          ['owner', 'admin', 'support'].map(function (r) { return '<option value="' + r + '"' + (r === s.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') +
        '</select></td>' +
        '<td class="adm-row-actions">' + (can('owner') && STAFF.length > 1 ? '<button class="btn btn-ghost adm-btn-sm adm-staff-remove" type="button">Remove</button>' : '') + '</td></tr>';
    }).join('');
    $('admWhitelistNote').textContent = 'Whitelist enforced — only the Discord IDs set in supabase-init.js\'s ADMIN_WHITELIST can open this dashboard. This staff list is separate role-management data and isn\'t the enforcement source.';
  }
  var staffBody = $('admStaffBody');
  if (staffBody) staffBody.addEventListener('change', function (e) {
    if (!e.target.classList.contains('adm-staff-role')) return;
    if (!can('owner')) return;
    var tr = e.target.closest('tr'); var id = tr.getAttribute('data-id');
    var s = STAFF.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    s.role = e.target.value; saveStaff(); logAudit('Changed ' + s.name + '\'s role to ' + s.role); renderTopbar();
  });
  if (staffBody) staffBody.addEventListener('click', function (e) {
    if (!e.target.classList.contains('adm-staff-remove')) return;
    if (!can('owner')) return;
    var tr = e.target.closest('tr'); var id = tr.getAttribute('data-id');
    var s = STAFF.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    if (!confirm('Remove ' + s.name + ' from staff?')) return;
    STAFF = STAFF.filter(function (x) { return x.id !== id; });
    ADMIN_WHITELIST = ADMIN_WHITELIST.filter(function (x) { return x !== s.discordId; });
    saveStaff(); logAudit('Removed staff member ' + s.name); renderStaff(); renderTopbar();
  });
  var addStaffForm = $('admAddStaffForm');
  if (addStaffForm) addStaffForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('owner')) return;
    var name = $('admNewStaffName').value.trim();
    var discordId = $('admNewStaffDiscord').value.trim();
    var role = $('admNewStaffRole').value;
    if (!name) return;
    var id = 'st' + Date.now().toString(36);
    STAFF.push({ id: id, name: name, discordId: discordId, role: role });
    if (discordId) ADMIN_WHITELIST.push(discordId);
    saveStaff(); logAudit('Added staff member ' + name + ' (' + role + ')');
    addStaffForm.reset(); renderStaff();
  });

  /* ================================================================
     AUDIT LOG PANEL
     ================================================================ */
  function renderAudit() {
    $('admAuditBody').innerHTML = AUDIT.map(function (a) {
      return '<tr><td>' + fmtDateTime(new Date(a.ts)) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="adm-empty">No actions logged yet this session.</td></tr>';
  }

  /* ================================================================
     INIT
     ================================================================ */
  renderTopbar();
  showPanel('home');
})();
