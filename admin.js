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

  // supabase-js's functions.invoke() does NOT put the parsed JSON body
  // into res.data on a non-2xx response - res.data is null and res.error
  // is a generic FunctionsHttpError whose .message is always literally
  // "Edge Function returned a non-2xx status code". The real error body
  // has to be read from res.error.context (the raw Response) instead, or
  // every custom error message from every admin Edge Function call gets
  // silently replaced by that one generic string. This wraps
  // functions.invoke() so every call site gets the real message.
  function invokeAdminFn(name, body, fallback) {
    return window.coldSupabase.functions.invoke(name, { body: body || {} }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        var parsed = (ctx && typeof ctx.json === 'function') ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
        return parsed.then(function (data) {
          throw new Error((data && data.error) || res.error.message || fallback || 'Request failed.');
        });
      }
      if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || fallback || 'Request failed.');
      return res.data;
    });
  }

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
     (cart, wishlist, owned products). Orders/order items are the one
     exception below (real data now, see refreshOrders); everything
     else here (users, referrals, traffic, abandoned carts) is still
     synthetic, and every aggregate derived from it is computed live
     rather than independently faked.
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

  // Real data from public.coupons, read via the signed-in admin's own
  // session (RLS: coupons_select_admin). Writes go through
  // admin-upsert-coupon / admin-delete-coupon (service role).
  var COUPONS = [];
  function mapCouponRow(row) {
    return {
      code: row.code,
      type: row.type,
      val: Number(row.val) || 0,
      active: !!row.active,
      limit: row.usage_limit,
      usageCount: row.usage_count || 0,
      expiresAt: row.expires_at,
      scope: row.scope,
      platform: row.platform,
      category: row.category
    };
  }
  function refreshCoupons() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('coupons').select('*').order('code').then(function (res) {
      if (res.error) { console.error('[admin] failed to load coupons:', res.error.message); return; }
      COUPONS = (res.data || []).map(mapCouponRow);
      if (curPanel === 'sales') { renderEvents(); renderCoupons(); }
    });
  }

  // Sale Events replace the site's hardcoded "Spring Sale" announcement
  // banner (assets.html/minecraft.html) with real admin-managed data - the
  // seed below matches that banner's original copy so nothing visually
  // changes until an admin edits or adds an event.
  var SALE_EVENTS = seedIfEmpty('coldd_admin_sale_events_v1', function () {
    return [
      {
        id: 'ev1', title: 'Spring Sale',
        message: 'Spring Sale is live — 30% off every Roblox template through Sunday.',
        percentOff: 30, scope: 'platform', platform: 'Roblox', category: null,
        startDate: '2026-07-20', endDate: '2026-08-02', active: true
      }
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

  // Real data from public.orders/order_items, read via the signed-in
  // admin's own session (RLS: orders_select_admin / order_items_select_admin
  // let is_admin=true profiles see every order, not just their own).
  // profiles are fetched separately (orders.user_id references auth.users,
  // not public.profiles, so PostgREST can't embed it directly) via
  // profiles_select_admin. Writes (complete/refund) go through the
  // admin-manage-order Edge Function (service role) - never written
  // directly from here.
  var ORDERS = [];
  function mapOrderRow(row, profile) {
    var items = row.order_items || [];
    var first = items[0] || {};
    var product = first.product_slug ? findProduct(first.product_slug) : null;
    var status = row.status === 'paid' ? 'completed' : (row.status === 'failed' || row.status === 'canceled') ? 'failed' : row.status;
    return {
      id: row.id,
      dbId: row.id,
      date: row.created_at,
      userId: row.user_id,
      userName: profile ? (profile.username || profile.email || 'user') : 'guest',
      productId: first.product_slug || null,
      title: items.length > 1 ? (first.title + ' +' + (items.length - 1) + ' more') : (first.title || 'Unknown item'),
      image: product ? product.image : '',
      cat: product ? product.cat : null,
      platform: product ? product.platform : null,
      licence: first.licence || 'standard',
      qty: items.reduce(function (s, it) { return s + (it.qty || 1); }, 0),
      unitPrice: Number(first.unit_price_usd) || 0,
      subtotal: Number(row.subtotal_usd) || 0,
      couponCode: row.coupon_code || null,
      discount: Number(row.discount_usd) || 0,
      total: Number(row.total_usd) || 0,
      currency: row.currency || 'usd',
      status: status,
      refCode: null,
      refundReason: row.refund_reason || null,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      items: items
    };
  }
  function refreshOrders() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error('[admin] failed to load orders:', res.error.message); return; }
      var rows = res.data || [];
      var userIds = rows.map(function (o) { return o.user_id; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
      if (!userIds.length) {
        ORDERS = rows.map(function (o) { return mapOrderRow(o, null); });
        renderAll();
        return;
      }
      return window.coldSupabase.from('profiles').select('id,username,email').in('id', userIds).then(function (pRes) {
        var byId = {};
        (pRes.data || []).forEach(function (p) { byId[p.id] = p; });
        ORDERS = rows.map(function (o) { return mapOrderRow(o, byId[o.user_id]); });
        renderAll();
      });
    });
  }
  function callManageOrder(orderId, action, reason) {
    var body = { orderId: orderId, action: action };
    if (reason) body.reason = reason;
    return invokeAdminFn('admin-manage-order', body);
  }

  var REVIEWS = seedIfEmpty('coldd_admin_reviews_v1', function () { return (window.__REVIEWS || []).slice(); });

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

  var AUDIT = lsGet('coldd_admin_audit_v1', []);

  function saveUsers() { lsSet('coldd_admin_users_v1', USERS); }
  function saveSaleEvents() { lsSet('coldd_admin_sale_events_v1', SALE_EVENTS); }
  function saveStaff() { lsSet('coldd_admin_staff_v1', STAFF); }
  function saveReviews() { lsSet('coldd_admin_reviews_v1', REVIEWS); }
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
     PRODUCT VIEW MODEL — real data from public.products/product_legal,
     read via the signed-in admin's own session (RLS: products_select_admin
     / product_legal_select_admin let is_admin=true profiles see everything,
     not just is_active=true rows). Writes go through the admin-upsert-product
     / admin-delete-product Edge Functions (service role, re-checks is_admin
     server-side) - never written directly from here.
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
  var PRODUCTS_CACHE = [];
  function mapProductRow(row) {
    var legalRaw = Array.isArray(row.product_legal) ? (row.product_legal[0] || {}) : (row.product_legal || {});
    return {
      id: row.slug,
      dbId: row.id,
      title: row.title,
      price: Number(row.price_usd) || 0,
      priceNum: Number(row.price_usd) || 0,
      cat: row.cat,
      subcat: row.subcat,
      desc: row.description || '',
      longDesc: row.long_description || '',
      image: window.imgUrl(row.image),
      gallery: row.gallery || [],
      video: row.video || '',
      resell: !!row.resell_available,
      resellPrice: row.resell_price_usd != null ? Number(row.resell_price_usd) : null,
      robuxPrice: row.robux_price != null ? Number(row.robux_price) : null,
      tech: Object.assign(defaultTech(), row.tech || {}),
      legal: Object.assign(defaultLegal(), {
        tos: legalRaw.tos, proofFiles: legalRaw.proof_files, devProofFiles: legalRaw.dev_proof_files,
        contacts: legalRaw.contacts, licenseCost: legalRaw.license_cost, licenseCostCurrency: legalRaw.license_cost_currency,
        licensePurchasedAt: legalRaw.license_purchased_at, minSaleUsd: legalRaw.min_sale_usd, minSaleRobux: legalRaw.min_sale_robux,
        canBeFree: legalRaw.can_be_free, disallowSales: legalRaw.disallow_sales
      }),
      versions: row.versions || [],
      visible: !!row.is_active,
      robloxGamepassId: row.roblox_gamepass_id || null,
      robloxUniverseId: row.roblox_universe_id || null,
      platform: row.platform,
      page: row.page,
      createdAt: row.created_at || null,
      reviews: row.reviews_count || 0,
      rating: Number(row.rating) || 0
    };
  }
  function refreshProducts() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('products').select('*, product_legal(*)').order('title').then(function (res) {
      if (res.error) { console.error('[admin] failed to load products:', res.error.message); return; }
      PRODUCTS_CACHE = (res.data || []).map(mapProductRow);
      renderAll();
    });
  }
  function allProducts() { return PRODUCTS_CACHE; }
  function findProduct(id) { return allProducts().filter(function (p) { return p.id === id; })[0]; }

  // Builds the full admin-upsert-product payload from a product's current
  // view-model plus whatever's changing - the Edge Function replaces every
  // field on each call (it's a full upsert, not a patch), so every call site
  // must always send the complete current state, not just a delta.
  function upsertPayloadFor(p, overrides) {
    return Object.assign({
      id: p.dbId,
      title: p.title,
      platform: p.platform,
      price: p.priceNum,
      cat: p.cat,
      subcat: p.subcat,
      desc: p.desc,
      longDesc: p.longDesc,
      image: p.image,
      gallery: p.gallery,
      video: p.video,
      resell: p.resell,
      resellPrice: p.resellPrice,
      robuxPrice: p.robuxPrice,
      visible: p.visible,
      tech: p.tech,
      versions: p.versions,
      legal: p.legal
    }, overrides || {});
  }
  function callUpsertProduct(payload) {
    return invokeAdminFn('admin-upsert-product', payload, 'Save failed.');
  }
  function callDeleteProduct(dbId) {
    return invokeAdminFn('admin-delete-product', { id: dbId }, 'Delete failed.');
  }

  /* ================================================================
     PRODUCT LIST SORT (persisted across sessions, default newest)
     ================================================================ */
  var PROD_SORT = lsGet('coldd_admin_prod_sort_v1', 'newest');

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
  // Flattens completed orders' line items for product/category-level
  // aggregation (an order can contain multiple items, unlike the old
  // one-product-per-order mock ledger).
  function completedItemsInRange() {
    var out = [];
    completedInRange().forEach(function (o) {
      (o.items || []).forEach(function (it) {
        var product = findProduct(it.product_slug);
        out.push({
          productId: it.product_slug,
          title: it.title,
          image: product ? product.image : o.image,
          cat: product ? product.cat : o.cat,
          qty: it.qty || 1,
          revenue: (Number(it.unit_price_usd) || 0) * (it.qty || 1)
        });
      });
    });
    return out;
  }

  function revenueTotals() {
    var comp = completedInRange();
    var totalUSD = 0, byCurrency = { usd: 0, aud: 0, robux: 0 };
    comp.forEach(function (o) { totalUSD += o.total; byCurrency[o.currency] = (byCurrency[o.currency] || 0) + o.total; });
    return { totalUSD: totalUSD, byCurrency: byCurrency, count: comp.length };
  }
  function bestSellers(limit) {
    var map = {};
    completedItemsInRange().forEach(function (it) {
      map[it.productId] = map[it.productId] || { id: it.productId, title: it.title, image: it.image, units: 0, revenue: 0 };
      map[it.productId].units += it.qty;
      map[it.productId].revenue += it.revenue;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, limit || 6);
  }
  function revenueByCategory() {
    var map = {};
    completedItemsInRange().forEach(function (it) {
      map[it.cat] = (map[it.cat] || 0) + it.revenue;
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
    // usage_count/limit come straight off the coupons table (incremented
    // server-side in create-checkout-session). discountGiven/revenue are
    // computed live from the real orders table's coupon_code/discount_usd.
    var byCode = {};
    completedInRange().forEach(function (o) {
      if (!o.couponCode) return;
      byCode[o.couponCode] = byCode[o.couponCode] || { discountGiven: 0, revenue: 0 };
      byCode[o.couponCode].discountGiven += o.discount;
      byCode[o.couponCode].revenue += o.total;
    });
    return COUPONS.map(function (c) {
      var s = byCode[c.code];
      return { code: c.code, active: c.active, limit: c.limit, uses: c.usageCount, discountGiven: s ? s.discountGiven : 0, revenue: s ? s.revenue : 0 };
    });
  }

  /* ================================================================
     NAV / PANEL SWITCHING
     ================================================================ */
  var PANELS = ['home', 'analytics', 'products', 'product-edit', 'product-update', 'orders', 'refunds', 'reviews', 'users', 'sales', 'roblox', 'posts', 'tutorials', 'releases', 'staff', 'audit'];
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
    else if (name === 'sales') { renderEvents(); renderCoupons(); }
    else if (name === 'roblox') renderRobloxContainers();
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
  var roleDropdown = makeDropdown($('admRoleSelectDD'), {
    placeholder: 'Select viewer',
    onChange: function (id) { if (id) setRole(id); }
  });
  function renderTopbar() {
    var r = currentRole();
    roleDropdown.setOptions(STAFF.map(function (s) { return { value: s.id, label: s.name + ' — ' + s.role }; }), r.id);
    var av = $('admAvatar'); if (av) av.textContent = r.name.charAt(0).toUpperCase();
  }

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
    return ORDERS.filter(function (o) {
      if (o.status === 'refunded') return false;
      return (o.items || []).some(function (it) { return it.product_slug === id; });
    }).length;
  }
  function sortProducts(list) {
    var mode = PROD_SORT || 'newest';
    var withMeta = list.map(function (p, i) {
      return { p: p, i: i, sales: purchaseCount(p.id), created: Date.parse(p.createdAt) || 0 };
    });
    withMeta.sort(function (a, b) {
      if (mode === 'oldest') return (a.created - b.created) || (a.i - b.i);
      if (mode === 'sales-desc') return (b.sales - a.sales) || (a.i - b.i);
      if (mode === 'sales-asc') return (a.sales - b.sales) || (a.i - b.i);
      if (mode === 'rating-desc') return (b.p.rating - a.p.rating) || (a.i - b.i);
      if (mode === 'price-desc') return (b.p.priceNum - a.p.priceNum) || (a.i - b.i);
      if (mode === 'price-asc') return (a.p.priceNum - b.p.priceNum) || (a.i - b.i);
      return (b.created - a.created) || (a.i - b.i); // newest (default)
    });
    return withMeta.map(function (m) { return m.p; });
  }
  function renderProducts() {
    var q = ($('admProdSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var rows = sortProducts(allProducts().filter(function (p) { return !q || p.title.toLowerCase().indexOf(q) >= 0; }));
    $('admProdBody').innerHTML = rows.map(function (p) {
      var rating = (p.rating || 0).toFixed(1);
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><span class="dr-thumb" style="background-image:url(\'' + p.image + '\');width:52px;height:38px;display:inline-block;vertical-align:middle;border-radius:7px;"></span></td>' +
        '<td><a class="dt-link" href="/product?id=' + esc(p.id) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></td>' +
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
      var toggleBtn = e.target.closest('.adm-prod-toggle');
      toggleBtn.disabled = true;
      callUpsertProduct(upsertPayloadFor(p, { visible: !p.visible })).then(function () {
        logAudit((p.visible ? 'Unreleased' : 'Released') + ' product "' + p.title + '"');
        return refreshProducts();
      }).catch(function (err) {
        toggleBtn.disabled = false;
        alert(err.message || 'Could not update product.');
      });
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
  // Mirrors the sidebar subcategory filter tree on assets.html/minecraft.html
  // (Minecraft categories have no subcategories at all, hence no entries here).
  var SUBCATS_BY_CAT = {
    'Finished Games & Templates': [['finished-games', 'Finished Games'], ['game-templates', 'Game Templates']],
    'Maps': [['cities-towns', 'Cities & Towns'], ['houses-estates', 'Houses & Estates'], ['military-government', 'Military & Government'], ['nature-terrain', 'Nature & Terrain'], ['scpf', 'SCPF'], ['sci-fi', 'Sci-Fi'], ['airports-aviation', 'Airports & Aviation'], ['medieval', 'Medieval'], ['lobby-spawns', 'Lobby & Spawns'], ['cafes-retail', 'Cafes & Retail'], ['ugc-showcase-homestores', 'UGC Showcase & Homestores'], ['combat', 'Combat'], ['low-poly-simulator', 'Low Poly & Simulator']],
    'Scripts & UI': [['scripted-systems', 'Scripted Systems'], ['non-scripted-ui', 'Non-Scripted UI'], ['ui-packs', 'UI Packs'], ['roleplay', 'Roleplay'], ['military', 'Military'], ['combat', 'Combat'], ['economy', 'Economy']],
    'Graphics': [['military', 'Military'], ['scpf', 'SCPF'], ['logos', 'Logos']],
    'Buildings': [['filler', 'Filler'], ['furnished', 'Furnished'], ['roleplay', 'Roleplay'], ['building-packs', 'Building Packs'], ['military', 'Military'], ['houses-residential', 'Houses & Residential'], ['government', 'Government'], ['medieval', 'Medieval'], ['scpf', 'SCPF'], ['sci-fi', 'Sci-Fi'], ['stores-commercial', 'Stores & Commercial']],
    'Assets': [['asset-packs', 'Asset Packs'], ['realistic', 'Realistic'], ['medieval', 'Medieval'], ['sci-fi', 'Sci-Fi'], ['low-poly', 'Low Poly'], ['aviation', 'Aviation'], ['scpf', 'SCPF'], ['furniture', 'Furniture'], ['nature', 'Nature']],
    'Uniforms & Gear': [['2d-uniforms', '2D Uniforms'], ['3d-gear', '3D Gear'], ['military-government', 'Military & Government'], ['roleplay', 'Roleplay'], ['aviation', 'Aviation'], ['morphs', 'Morphs']],
    'Boats': [['military', 'Military'], ['civilian', 'Civilian'], ['commercial', 'Commercial']],
    'Weapons': [['military', 'Military'], ['medieval', 'Medieval'], ['scripted', 'Scripted'], ['firearms', 'Firearms'], ['melees', 'Melees']],
    'Vehicles': [['scripted', 'Scripted'], ['military', 'Military'], ['civilian', 'Civilian'], ['trains-locomotives', 'Trains & Locomotives'], ['emergency-services', 'Emergency Services']],
    'Animations & VFX': [['vfx', 'VFX'], ['animations', 'Animations'], ['vfx-packs', 'VFX Packs'], ['combat', 'Combat'], ['auras', 'Auras']]
  };
  var editContacts = [];
  var editProofFiles = [];
  var editDevProofFiles = [];
  var editGallery = [];
  var pendingStoragePath = null; // set when a new product file upload succeeds, sent on next save
  var draftSlug = null; // lazily-created placeholder path prefix for uploads before the product has a real slug

  // Uploads a file to Storage via admin-get-upload-url, then PUTs the bytes
  // straight there (bytes never pass through our own server/functions).
  // kind: 'thumbnail' | 'gallery' | 'productFile'. productSlug is only ever
  // used as a Storage path prefix for organization - it doesn't need to
  // match the product's real slug, so a brand-new unsaved product gets a
  // throwaway draft identifier instead of blocking uploads until first save.
  function uploadToStorage(kind, file) {
    var slug = $('admEditId').value;
    if (!slug) {
      if (!draftSlug) draftSlug = 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      slug = draftSlug;
    }
    return invokeAdminFn('admin-get-upload-url', { kind: kind, productSlug: slug, filename: file.name }, 'Could not prepare upload.').then(function (d) {
      return window.coldSupabase.storage.from(d.bucket).uploadToSignedUrl(d.path, d.token, file).then(function (upRes) {
        if (upRes.error) throw new Error(upRes.error.message || 'Upload failed.');
        return { path: d.path, publicUrl: d.publicUrl };
      });
    });
  }

  /* ---- Reusable custom dropdown (replaces native <select> everywhere in admin) ----
     root must contain .adm-dd-btn (with .adm-dd-val + chevron) and .adm-dd-menu,
     matching the markup already used for the product category picker. */
  function makeDropdown(root, opts) {
    opts = opts || {};
    if (!root) return { setOptions: function () {}, setValue: function () {}, getValue: function () { return ''; }, close: function () {} };
    var btn = root.querySelector('.adm-dd-btn');
    var valEl = root.querySelector('.adm-dd-val');
    var menu = root.querySelector('.adm-dd-menu');
    var valueInput = opts.valueInput || null;
    var placeholder = opts.placeholder || 'Select…';
    var current = '';
    var optionList = [];

    function close() { root.classList.remove('open'); if (menu) menu.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); }
    function open() { root.classList.add('open'); if (menu) menu.hidden = false; if (btn) btn.setAttribute('aria-expanded', 'true'); }
    function labelFor(value) {
      var found = optionList.filter(function (o) { return o.value === value; })[0];
      return found ? found.label : value;
    }
    function setValue(value, silent) {
      current = value || '';
      if (valEl) { valEl.textContent = current ? labelFor(current) : placeholder; valEl.classList.toggle('placeholder', !current); }
      if (valueInput) valueInput.value = current;
      if (menu) Array.prototype.forEach.call(menu.querySelectorAll('.adm-dd-opt'), function (o) {
        o.classList.toggle('active', o.getAttribute('data-value') === current);
      });
      if (!silent && typeof opts.onChange === 'function') opts.onChange(current);
    }
    function setOptions(list, selected) {
      optionList = list.map(function (o) { return typeof o === 'string' ? { value: o, label: o } : o; });
      if (menu) {
        menu.innerHTML = optionList.map(function (o) {
          var isActive = o.value === selected;
          return '<button type="button" class="adm-dd-opt' + (isActive ? ' active' : '') + '" data-value="' + esc(o.value) + '" role="option" aria-selected="' + (isActive ? 'true' : 'false') + '"><span>' + esc(o.label) + '</span><span class="adm-dd-radio"></span></button>';
        }).join('');
        Array.prototype.forEach.call(menu.querySelectorAll('.adm-dd-opt'), function (o) {
          o.addEventListener('click', function () { setValue(o.getAttribute('data-value')); close(); });
        });
      }
      setValue(selected != null ? selected : current, true);
    }
    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu && menu.hidden) open(); else close();
    });
    document.addEventListener('click', function (e) { if (!root.contains(e.target)) close(); });

    return { setOptions: setOptions, setValue: setValue, getValue: function () { return current; }, close: close };
  }

  var prodSortDropdown = makeDropdown($('admProdSortDD'), {
    onChange: function (v) { PROD_SORT = v || 'newest'; lsSet('coldd_admin_prod_sort_v1', PROD_SORT); renderProducts(); }
  });
  prodSortDropdown.setOptions([
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'sales-desc', label: 'Highest Sales' },
    { value: 'sales-asc', label: 'Lowest Sales' },
    { value: 'rating-desc', label: 'Highest Rated' },
    { value: 'price-desc', label: 'Price: High to Low' },
    { value: 'price-asc', label: 'Price: Low to High' }
  ], PROD_SORT);

  var subcatDropdown = makeDropdown($('admEditSubcatDD'), { valueInput: $('admEditSubcat'), placeholder: 'None' });
  function populateSubcatSelect(cat, selected) {
    var subs = SUBCATS_BY_CAT[cat] || [];
    var opts = subs.map(function (s) { return { value: s[0], label: s[1] }; });
    if (selected && opts.filter(function (o) { return o.value === selected; }).length === 0) opts = opts.concat([{ value: selected, label: selected }]);
    opts = [{ value: '', label: 'None' }].concat(opts);
    subcatDropdown.setOptions(opts, selected || '');
  }
  var catDropdown = makeDropdown($('admEditCatDD'), {
    valueInput: $('admEditCat'), placeholder: 'Select category',
    onChange: function (cat) { populateSubcatSelect(cat, null); }
  });
  function populateCategorySelect(platform, selected, subcatToKeep) {
    var cats = CATEGORIES_BY_PLATFORM[platform] || [];
    if (selected && cats.indexOf(selected) < 0) cats = cats.concat([selected]);
    var finalCat = selected || cats[0] || '';
    catDropdown.setOptions(cats, finalCat);
    populateSubcatSelect(finalCat, subcatToKeep);
  }
  function setEditPlatform(platform, catToKeep, subcatToKeep) {
    $('admEditPlatform').value = platform;
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-platform') === platform);
    });
    populateCategorySelect(platform, catToKeep, subcatToKeep);
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
    uploadToStorage('thumbnail', file).then(function (r) {
      $('admEditThumbUrl').value = r.publicUrl;
      updateThumbPreview();
    }).catch(function (err) { alert(err.message || 'Could not upload thumbnail.'); });
  }
  function addGalleryFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      uploadToStorage('gallery', f).then(function (r) {
        editGallery.push(r.publicUrl);
        renderGalleryList();
      }).catch(function (err) { alert(err.message || 'Could not upload image.'); });
    });
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

  function renderGamepassStatus(p) {
    var el = $('admGamepassStatus'); if (!el) return;
    if (!p || p.platform !== 'Roblox') { el.textContent = ''; return; }
    if (p.robloxGamepassId) {
      el.textContent = 'Roblox gamepass linked (universe ' + p.robloxUniverseId + ', pass ' + p.robloxGamepassId + '). Price syncs on save.';
    } else {
      el.textContent = 'Not linked to a Roblox gamepass yet - one will be created on save.';
    }
  }

  function openProductEdit(id) {
    var p = findProduct(id); if (!p) return;
    pendingStoragePath = null;
    $('admEditId').value = p.id;
    $('admEditTitleInput').value = p.title;
    $('admEditPrice').value = p.price;
    $('admEditRobuxPrice').value = p.robuxPrice != null ? p.robuxPrice : '';
    setEditPlatform(p.platform, p.cat, p.subcat);
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) { b.disabled = false; });
    $('admEditSubtext').value = p.desc || '';
    $('admEditLongDesc').value = p.longDesc || '';
    $('admEditResell').checked = !!p.resell;
    $('admEditResellPrice').value = p.resellPrice != null ? p.resellPrice : '';
    $('admEditResellPriceWrap').hidden = !p.resell;
    $('admEditReleased').checked = !!p.visible;
    $('admEditDeleteBtn').hidden = false;
    $('admEditHeading').textContent = 'Edit: ' + p.title;
    $('admEditSaveBtn').textContent = 'Save changes';
    $('admEditMsg').textContent = '';
    updateDevexHint();
    renderGamepassStatus(p);

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
    var fileNote = $('admEditFileNote');
    var dot = f.name.lastIndexOf('.');
    $('admEditTechFormat').value = dot >= 0 ? f.name.slice(dot).toLowerCase() : '';
    $('admEditTechSize').value = formatFileSize(f.size);
    $('admEditTechFileName').value = f.name;
    fileNote.textContent = 'Uploading ' + f.name + '…';
    fileNote.removeAttribute('href');
    uploadToStorage('productFile', f).then(function (r) {
      pendingStoragePath = r.path;
      fileNote.textContent = 'Selected: ' + f.name + ' (uploaded, saved with the product)';
    }).catch(function (err) {
      pendingStoragePath = null;
      fileNote.textContent = 'Upload failed: ' + (err.message || 'try again') + '.';
    });
  });

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
    pendingStoragePath = null;
    $('admEditId').value = '';
    $('admEditTitleInput').value = '';
    $('admEditPrice').value = 0;
    $('admEditRobuxPrice').value = '';
    renderGamepassStatus(null);
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
      subcat: $('admEditSubcat').value || null,
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
    var saveBtn = $('admEditSaveBtn');

    if (isCreate) {
      var title = $('admEditTitleInput').value.trim();
      if (!title) { if (msg) msg.textContent = 'Enter a title.'; return; }
      var fields = Object.assign({ title: title, platform: platform }, collectEditFields());
      if (!fields.image) fields.image = '/banner.jpg';
      if (saveBtn) saveBtn.disabled = true;
      if (msg) msg.textContent = 'Creating…';
      callUpsertProduct(fields).then(function (res) {
        logAudit('Created product "' + title + '"');
        return refreshProducts().then(function () {
          if (saveBtn) saveBtn.disabled = false;
          var created = allProducts().filter(function (p) { return p.dbId === res.id; })[0];
          if (created) openProductEdit(created.id);
          if (msg) msg.textContent = res.robloxWarning || 'Created.';
        });
      }).catch(function (err) {
        if (saveBtn) saveBtn.disabled = false;
        if (msg) msg.textContent = err.message || 'Could not create product.';
      });
      return;
    }

    var p = findProduct(id); if (!p) return;
    var fields = Object.assign({ title: $('admEditTitleInput').value.trim() || p.title, platform: platform }, collectEditFields());
    if (pendingStoragePath) fields.storagePath = pendingStoragePath;
    if (saveBtn) saveBtn.disabled = true;
    if (msg) msg.textContent = 'Saving…';
    var savedRobloxWarning;
    callUpsertProduct(upsertPayloadFor(p, fields)).then(function (res) {
      savedRobloxWarning = res && res.robloxWarning;
      logAudit('Updated product "' + fields.title + '"');
      pendingStoragePath = null;
      return refreshProducts();
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
      if (msg) msg.textContent = savedRobloxWarning || 'Saved.';
      var updated = findProduct(id);
      if (updated) renderGamepassStatus(updated);
    }).catch(function (err) {
      if (saveBtn) saveBtn.disabled = false;
      if (msg) msg.textContent = err.message || 'Could not save product.';
    });
  });
  var editDeleteBtn = $('admEditDeleteBtn');
  if (editDeleteBtn) editDeleteBtn.addEventListener('click', function () {
    if (!can('admin')) return;
    var id = $('admEditId').value;
    var p = findProduct(id); if (!p) return;
    if (!confirm('Remove "' + p.title + '" from the storefront? You can bring it back later by editing it and turning Released back on.')) return;
    editDeleteBtn.disabled = true;
    callDeleteProduct(p.dbId).then(function () {
      logAudit('Removed product "' + p.title + '"');
      return refreshProducts();
    }).then(function () {
      showPanel('products');
    }).catch(function (err) {
      editDeleteBtn.disabled = false;
      alert(err.message || 'Could not remove product.');
    });
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
    var overrides = { versions: versions };
    if (!$('admUpdDescWrap').hidden) overrides.longDesc = $('admUpdDescInput').value.trim();

    updSubmitBtn.disabled = true;
    if (msg) msg.textContent = 'Pushing…';
    callUpsertProduct(upsertPayloadFor(p, overrides)).then(function () {
      logAudit('Pushed update ' + version + ' for "' + p.title + '"');
      return refreshProducts();
    }).then(function () {
      updSubmitBtn.disabled = false;
      if (msg) msg.textContent = 'Update pushed.';
      $('admUpdVersion').value = '';
      $('admUpdChangelog').value = '';
      renderUpdHistory(findProduct(updSelectedId));
    }).catch(function (err) {
      updSubmitBtn.disabled = false;
      if (msg) msg.textContent = err.message || 'Could not push update.';
    });
  });

  /* ================================================================
     ORDERS PANEL
     ================================================================ */
  var orderStatusDropdown = makeDropdown($('admOrderStatusFilterDD'), {
    onChange: function () { renderOrders(); }
  });
  orderStatusDropdown.setOptions([
    { value: 'all', label: 'All statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'failed', label: 'Failed' }
  ], 'all');
  function renderOrders() {
    var statusF = orderStatusDropdown.getValue() || 'all';
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
      e.target.disabled = true;
      callManageOrder(o.dbId, 'complete').then(function () {
        logAudit('Marked order ' + id + ' completed');
        return refreshOrders();
      }).catch(function (err) {
        e.target.disabled = false;
        alert(err.message || 'Could not update the order.');
      });
    } else if (e.target.classList.contains('adm-order-refund')) {
      if (!can('support')) return;
      e.target.disabled = true;
      callManageOrder(o.dbId, 'refund', 'Manual refund by staff').then(function () {
        logAudit('Refunded order ' + id + ' (' + usd(o.total) + ')');
        return refreshOrders();
      }).catch(function (err) {
        e.target.disabled = false;
        alert(err.message || 'Could not process the refund.');
      });
    }
  });
  var orderSearchInput = $('admOrderSearch');
  if (orderSearchInput) orderSearchInput.addEventListener('input', renderOrders);

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
    e.target.disabled = true;
    callManageOrder(o.dbId, 'refund', reason).then(function () {
      logAudit('Issued refund for ' + id + ' — ' + reason);
      return refreshOrders();
    }).catch(function (err) {
      e.target.disabled = false;
      alert(err.message || 'Could not process the refund.');
    });
  });

  /* ================================================================
     REVIEWS PANEL
     ================================================================ */
  var reviewFilterDropdown = makeDropdown($('admReviewFilterDD'), {
    onChange: function () { renderReviews(); }
  });
  reviewFilterDropdown.setOptions([
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'all', label: 'All' }
  ], 'pending');
  function renderReviews() {
    var f = reviewFilterDropdown.getValue() || 'pending';
    var rows = REVIEWS.filter(function (r) { return f === 'all' || r.status === f; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    $('admReviewsList').innerHTML = rows.map(function (r) {
      var stars = '';
      for (var i = 0; i < 5; i++) stars += '<span class="pd-star ' + (i < r.stars ? 'on' : '') + '">' + (i < r.stars ? '★' : '☆') + '</span>';
      return '<div class="dash-card glass adm-review" data-id="' + r.id + '">' +
        '<div class="adm-review-head"><strong>' + esc(r.user) + '</strong><span class="adm-sub">on ' + esc(r.productTitle) + '</span><span class="adm-sub">' + fmtDate(new Date(r.date)) + '</span>' + statusBadge(r.status === 'approved' ? 'completed' : (r.status === 'hidden' ? 'refunded' : 'pending')) + '</div>' +
        '<div class="pd-rev-stars">' + stars + '</div>' +
        '<p class="adm-review-text">' + esc(r.text) + '</p>' +
        (r.reply ? '<div class="adm-review-reply"><strong>Your reply</strong><p>' + esc(r.reply.text) + '</p></div>' : '') +
        '<div class="adm-review-reply-form" hidden>' +
          '<textarea class="adm-input adm-textarea adm-rev-reply-input" rows="2" placeholder="Write a public reply to this review…">' + esc(r.reply ? r.reply.text : '') + '</textarea>' +
          '<button type="button" class="btn btn-primary adm-btn-sm adm-rev-reply-save">Save reply</button>' +
        '</div>' +
        '<div class="adm-row-actions">' +
          (r.status !== 'approved' ? '<button class="btn btn-ghost adm-btn-sm adm-rev-approve" type="button">Approve</button>' : '') +
          (r.status !== 'hidden' ? '<button class="btn btn-ghost adm-btn-sm adm-rev-hide" type="button">Hide</button>' : '') +
          '<button class="btn btn-ghost adm-btn-sm adm-rev-reply-toggle" type="button">' + (r.reply ? 'Edit reply' : 'Reply') + '</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-rev-goto" type="button">Go to product</button>' +
        '</div></div>';
    }).join('') || '<p class="adm-empty">Nothing here.</p>';
  }
  var reviewsList = $('admReviewsList');
  if (reviewsList) reviewsList.addEventListener('click', function (e) {
    var card = e.target.closest('.adm-review'); if (!card) return;
    var id = card.getAttribute('data-id');
    var r = REVIEWS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (e.target.classList.contains('adm-rev-approve')) {
      r.status = 'approved'; logAudit('Approved review by ' + r.user + ' on "' + r.productTitle + '"');
      saveReviews(); renderReviews();
    } else if (e.target.classList.contains('adm-rev-hide')) {
      r.status = 'hidden'; logAudit('Hid review by ' + r.user + ' on "' + r.productTitle + '"');
      saveReviews(); renderReviews();
    } else if (e.target.classList.contains('adm-rev-reply-toggle')) {
      var form = card.querySelector('.adm-review-reply-form');
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('textarea').focus();
    } else if (e.target.classList.contains('adm-rev-reply-save')) {
      var text = card.querySelector('.adm-rev-reply-input').value.trim();
      r.reply = text ? { text: text, date: new Date().toISOString() } : null;
      logAudit((text ? 'Replied to' : 'Removed reply on') + ' review by ' + r.user + ' on "' + r.productTitle + '"');
      saveReviews(); renderReviews();
    } else if (e.target.classList.contains('adm-rev-goto')) {
      openProductEdit(r.productId);
    }
  });
  /* ================================================================
     USERS PANEL (+ manual product grants)
     ================================================================ */
  function userSpend(userId) {
    return ORDERS.filter(function (o) { return o.userId === userId && o.status === 'completed'; }).reduce(function (s, o) { return s + o.total; }, 0);
  }
  function userOrderCount(userId) { return ORDERS.filter(function (o) { return o.userId === userId; }).length; }
  var grantUserDropdown = makeDropdown($('admGrantUserDD'), { valueInput: $('admGrantUser'), placeholder: 'Select user' });
  var grantProductDropdown = makeDropdown($('admGrantProductDD'), { valueInput: $('admGrantProduct'), placeholder: 'Select product' });
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

    grantUserDropdown.setOptions(USERS.map(function (u) { return { value: u.id, label: u.name }; }), grantUserDropdown.getValue());
    grantProductDropdown.setOptions(allProducts().map(function (p) { return { value: p.id, label: p.title }; }), grantProductDropdown.getValue());
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
    // No admin-grant-product Edge Function exists yet, so this only adds
    // a local, in-memory row for immediate feedback - it is NOT written to
    // the real orders table and will disappear on the next refreshOrders().
    ORDERS.unshift({
      id: 'CLD-GRANT-' + Date.now().toString(36).toUpperCase(),
      date: new Date().toISOString(), userId: u.id, userName: u.name,
      productId: p.id, title: p.title, image: p.image, cat: p.cat, platform: p.platform,
      licence: 'standard', qty: 1, unitPrice: 0, subtotal: 0, couponCode: null, discount: 0, total: 0,
      currency: 'usd', status: 'completed', refCode: null, refundReason: null, granted: true, items: []
    });
    logAudit('Manually granted "' + p.title + '" to ' + u.name);
    var msg = $('admGrantMsg'); if (msg) { msg.textContent = 'Granted "' + p.title + '" to ' + u.name + '.'; setTimeout(function () { msg.textContent = ''; }, 3000); }
    renderUsers(); if (curPanel === 'orders') renderOrders();
  });

  /* ================================================================
     SALES & DISCOUNTS PANEL (Sale Events + Discount Codes)
     ================================================================ */
  function buildScopeOptions() {
    var out = [{ value: 'sitewide', label: 'Sitewide' }];
    Object.keys(CATEGORIES_BY_PLATFORM).forEach(function (platform) {
      out.push({ value: 'platform:' + platform, label: platform + ' — All categories' });
      CATEGORIES_BY_PLATFORM[platform].forEach(function (cat) {
        out.push({ value: 'category:' + platform + ':' + cat, label: platform + ' — ' + cat });
      });
    });
    return out;
  }
  function parseScopeValue(value) {
    var parts = String(value || 'sitewide').split(':');
    if (parts[0] === 'platform') return { scope: 'platform', platform: parts[1], category: null };
    if (parts[0] === 'category') return { scope: 'category', platform: parts[1], category: parts.slice(2).join(':') };
    return { scope: 'sitewide', platform: null, category: null };
  }
  function scopeValueFor(item) {
    if (item.scope === 'platform') return 'platform:' + item.platform;
    if (item.scope === 'category') return 'category:' + item.platform + ':' + item.category;
    return 'sitewide';
  }
  function scopeLabel(item) {
    if (item.scope === 'platform') return item.platform;
    if (item.scope === 'category') return item.platform + ': ' + item.category;
    return 'Sitewide';
  }

  var salesTypeToggle = $('admSalesTypeToggle');
  if (salesTypeToggle) salesTypeToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-sales-type-btn'); if (!btn) return;
    var type = btn.getAttribute('data-type');
    salesTypeToggle.querySelectorAll('.adm-sales-type-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $('admSalesEventsView').hidden = type !== 'events';
    $('admDiscountCodesView').hidden = type !== 'codes';
  });

  /* ---- Sale Events ---- */
  function eventStatus(ev) {
    var today = new Date().toISOString().slice(0, 10);
    if (!ev.active) return 'inactive';
    if (today < ev.startDate) return 'scheduled';
    if (today > ev.endDate) return 'ended';
    return 'live';
  }
  var eventScopeDropdown = makeDropdown($('admEventScopeDD'), { valueInput: $('admEventScope') });
  eventScopeDropdown.setOptions(buildScopeOptions(), 'sitewide');

  function renderEvents() {
    $('admEventsBody').innerHTML = SALE_EVENTS.map(function (ev) {
      var status = eventStatus(ev);
      var badge = status === 'live' ? '<span class="dt-badge ok">Live now</span>' : status === 'scheduled' ? '<span class="dt-badge">Scheduled</span>' : status === 'ended' ? '<span class="dt-badge err">Ended</span>' : '<span class="dt-badge err">Inactive</span>';
      return '<tr data-id="' + ev.id + '"><td>' + esc(ev.title) + '</td><td>' + ev.percentOff + '% off</td><td>' + esc(scopeLabel(ev)) + '</td><td>' + esc(ev.startDate) + ' – ' + esc(ev.endDate) + '</td><td>' + badge + '</td>' +
        '<td class="adm-row-actions">' + (can('admin') ? '<button class="btn btn-ghost adm-btn-sm adm-event-edit" type="button">Edit</button><button class="btn btn-ghost adm-btn-sm adm-event-toggle" type="button">' + (ev.active ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-ghost adm-btn-sm adm-event-del" type="button">Delete</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No sale events yet.</td></tr>';
  }
  function resetEventForm() {
    $('admEventEditId').value = '';
    $('admEventTitle').value = ''; $('admEventMessage').value = ''; $('admEventPercent').value = '';
    eventScopeDropdown.setValue('sitewide');
    $('admEventStart').value = ''; $('admEventEnd').value = '';
    $('admEventFormTitle').textContent = 'Create sale event';
    $('admEventSubmitBtn').textContent = 'Create event';
    $('admEventCancelBtn').hidden = true;
  }
  function fillEventForm(ev) {
    $('admEventEditId').value = ev.id;
    $('admEventTitle').value = ev.title; $('admEventMessage').value = ev.message; $('admEventPercent').value = ev.percentOff;
    eventScopeDropdown.setValue(scopeValueFor(ev));
    $('admEventStart').value = ev.startDate; $('admEventEnd').value = ev.endDate;
    $('admEventFormTitle').textContent = 'Edit sale event';
    $('admEventSubmitBtn').textContent = 'Save changes';
    $('admEventCancelBtn').hidden = false;
  }
  var eventsBody = $('admEventsBody');
  if (eventsBody) eventsBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var ev = SALE_EVENTS.filter(function (x) { return x.id === id; })[0]; if (!ev) return;
    if (!can('admin')) return;
    if (e.target.classList.contains('adm-event-edit')) { fillEventForm(ev); }
    else if (e.target.classList.contains('adm-event-toggle')) {
      ev.active = !ev.active; saveSaleEvents(); logAudit((ev.active ? 'Activated' : 'Deactivated') + ' sale event "' + ev.title + '"'); renderEvents();
    } else if (e.target.classList.contains('adm-event-del')) {
      if (!confirm('Delete sale event "' + ev.title + '"? This can\'t be undone.')) return;
      SALE_EVENTS = SALE_EVENTS.filter(function (x) { return x.id !== id; });
      saveSaleEvents(); logAudit('Deleted sale event "' + ev.title + '"'); renderEvents();
      if ($('admEventEditId').value === id) resetEventForm();
    }
  });
  var eventCancelBtn = $('admEventCancelBtn');
  if (eventCancelBtn) eventCancelBtn.addEventListener('click', resetEventForm);
  var eventForm = $('admEventForm');
  if (eventForm) eventForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var id = $('admEventEditId').value;
    var scopeInfo = parseScopeValue($('admEventScope').value);
    var fields = {
      title: $('admEventTitle').value.trim(),
      message: $('admEventMessage').value.trim(),
      percentOff: Math.max(1, Math.min(90, parseInt($('admEventPercent').value, 10) || 0)),
      scope: scopeInfo.scope, platform: scopeInfo.platform, category: scopeInfo.category,
      startDate: $('admEventStart').value, endDate: $('admEventEnd').value
    };
    if (!fields.title || !fields.message || !fields.startDate || !fields.endDate) return;
    if (id) {
      var ev = SALE_EVENTS.filter(function (x) { return x.id === id; })[0]; if (!ev) return;
      Object.assign(ev, fields);
      logAudit('Updated sale event "' + fields.title + '"');
    } else {
      SALE_EVENTS.push(Object.assign({ id: 'ev' + Date.now().toString(36), active: true }, fields));
      logAudit('Created sale event "' + fields.title + '"');
    }
    saveSaleEvents(); resetEventForm(); renderEvents();
  });

  /* ---- Discount Codes ---- */
  var couponTypeDropdown = makeDropdown($('admNewCouponTypeDD'), { valueInput: $('admNewCouponType') });
  couponTypeDropdown.setOptions([{ value: 'pct', label: '% off' }, { value: 'flat', label: '$ off' }], 'pct');
  var couponScopeDropdown = makeDropdown($('admCouponScopeDD'), { valueInput: $('admCouponScope') });
  couponScopeDropdown.setOptions(buildScopeOptions(), 'sitewide');

  function renderCoupons() {
    var cs = couponStats();
    $('admCouponsBody').innerHTML = COUPONS.map(function (c) {
      var stat = cs.filter(function (x) { return x.code === c.code; })[0] || { uses: 0, discountGiven: null };
      return '<tr data-code="' + esc(c.code) + '"><td class="dt-mono">' + esc(c.code) + '</td><td>' + (c.type === 'pct' ? c.val + '%' : usd(c.val)) + '</td><td>' + esc(scopeLabel(c)) + '</td><td>' + (c.expiresAt ? esc(c.expiresAt) : '—') + '</td><td>' + stat.uses + (c.limit ? ' / ' + c.limit : '') + '</td><td>' + (stat.discountGiven == null ? '—' : usd(stat.discountGiven)) + '</td>' +
        '<td>' + (c.active ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Inactive</span>') + '</td>' +
        '<td class="adm-row-actions">' + (can('admin') ? '<button class="btn btn-ghost adm-btn-sm adm-coupon-edit" type="button">Edit</button><button class="btn btn-ghost adm-btn-sm adm-coupon-toggle" type="button">' + (c.active ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-ghost adm-btn-sm adm-coupon-del" type="button">Delete</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="adm-empty">No discount codes yet.</td></tr>';
  }
  function resetCouponForm() {
    $('admCouponEditId').value = '';
    $('admNewCouponCode').value = ''; $('admNewCouponVal').value = ''; $('admNewCouponLimit').value = '';
    $('admNewCouponExpiry').value = '';
    couponTypeDropdown.setValue('pct'); couponScopeDropdown.setValue('sitewide');
    $('admCouponFormTitle').textContent = 'Create discount code';
    $('admCouponSubmitBtn').textContent = 'Create discount code';
    $('admCouponCancelBtn').hidden = true;
  }
  function fillCouponForm(c) {
    $('admCouponEditId').value = c.code;
    $('admNewCouponCode').value = c.code; $('admNewCouponVal').value = c.val; $('admNewCouponLimit').value = c.limit || '';
    $('admNewCouponExpiry').value = c.expiresAt || '';
    couponTypeDropdown.setValue(c.type); couponScopeDropdown.setValue(scopeValueFor(c));
    $('admCouponFormTitle').textContent = 'Edit discount code';
    $('admCouponSubmitBtn').textContent = 'Save changes';
    $('admCouponCancelBtn').hidden = false;
  }
  function callUpsertCoupon(payload) {
    return invokeAdminFn('admin-upsert-coupon', payload, 'Could not save the code.');
  }
  function callDeleteCoupon(code) {
    return invokeAdminFn('admin-delete-coupon', { code: code }, 'Could not delete the code.');
  }
  var couponsBody = $('admCouponsBody');
  if (couponsBody) couponsBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var code = tr.getAttribute('data-code');
    var c = COUPONS.filter(function (x) { return x.code === code; })[0]; if (!c) return;
    if (!can('admin')) return;
    if (e.target.classList.contains('adm-coupon-edit')) { fillCouponForm(c); }
    else if (e.target.classList.contains('adm-coupon-toggle')) {
      var toggleBtn = e.target;
      toggleBtn.disabled = true;
      callUpsertCoupon({
        editingCode: c.code, code: c.code, type: c.type, val: c.val, active: !c.active,
        usageLimit: c.limit, expiresAt: c.expiresAt, scope: c.scope, platform: c.platform, category: c.category
      }).then(function () {
        logAudit((c.active ? 'Deactivated' : 'Activated') + ' coupon ' + code);
        return refreshCoupons();
      }).catch(function (err) {
        toggleBtn.disabled = false;
        alert(err.message || 'Could not update the code.');
      });
    } else if (e.target.classList.contains('adm-coupon-del')) {
      if (!confirm('Delete coupon ' + code + '? This can\'t be undone.')) return;
      callDeleteCoupon(code).then(function () {
        logAudit('Deleted coupon ' + code);
        if ($('admCouponEditId').value === code) resetCouponForm();
        return refreshCoupons();
      }).catch(function (err) { alert(err.message || 'Could not delete the code.'); });
    }
  });
  var couponCancelBtn = $('admCouponCancelBtn');
  if (couponCancelBtn) couponCancelBtn.addEventListener('click', resetCouponForm);
  var addCouponForm = $('admAddCouponForm');
  if (addCouponForm) addCouponForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var editId = $('admCouponEditId').value;
    var code = $('admNewCouponCode').value.trim().toUpperCase();
    var type = $('admNewCouponType').value;
    var val = parseFloat($('admNewCouponVal').value) || 0;
    var limit = parseInt($('admNewCouponLimit').value, 10) || null;
    var expiresAt = $('admNewCouponExpiry').value || null;
    var scopeInfo = parseScopeValue($('admCouponScope').value);
    if (!code || !val) return;
    var submitBtn = $('admCouponSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    callUpsertCoupon({
      editingCode: editId || undefined, code: code, type: type, val: val, active: true,
      usageLimit: limit, expiresAt: expiresAt, scope: scopeInfo.scope, platform: scopeInfo.platform, category: scopeInfo.category
    }).then(function () {
      logAudit((editId ? 'Updated' : 'Created') + ' discount code ' + code);
      resetCouponForm();
      return refreshCoupons();
    }).catch(function (err) {
      alert(err.message || 'Could not save the code.');
    }).then(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  });

  /* ================================================================
     ROBLOX PANEL (container game pool that gamepasses get created in)
     ================================================================ */
  var ROBLOX_CONTAINERS = [];
  function refreshRobloxContainers() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('roblox_containers').select('*').order('created_at').then(function (res) {
      if (res.error) { console.error('[admin] failed to load roblox containers:', res.error.message); return; }
      ROBLOX_CONTAINERS = res.data || [];
      if (curPanel === 'roblox') renderRobloxContainers();
    });
  }
  function callUpsertRobloxContainer(payload) {
    return invokeAdminFn('admin-upsert-roblox-container', payload, 'Save failed.');
  }
  function resetRobloxContainerForm() {
    $('admRobloxContainerEditId').value = '';
    $('admRobloxContainerUniverseId').value = '';
    $('admRobloxContainerLabel').value = '';
    $('admRobloxContainerFormTitle').textContent = 'Add container game';
    $('admRobloxContainerSubmitBtn').textContent = 'Add container';
    $('admRobloxContainerCancelBtn').hidden = true;
  }
  function renderRobloxContainers() {
    var body = $('admRobloxContainersBody'); if (!body) return;
    body.innerHTML = ROBLOX_CONTAINERS.map(function (c) {
      var full = c.gamepass_count >= 50;
      var statusBadge = !c.active ? '<span class="dt-badge warn">Disabled</span>' : full ? '<span class="dt-badge err">Full</span>' : '<span class="dt-badge ok">Open</span>';
      return '<tr data-id="' + esc(c.id) + '">' +
        '<td class="dt-mono">' + esc(c.universe_id) + '</td>' +
        '<td>' + esc(c.label || '') + '</td>' +
        '<td>' + c.gamepass_count + ' / 50</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="btn btn-ghost adm-btn-sm adm-roblox-edit" type="button">Edit</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-roblox-toggle" type="button">' + (c.active ? 'Disable' : 'Enable') + '</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="adm-empty">No container games registered yet.</td></tr>';
  }
  var robloxContainersBody = $('admRobloxContainersBody');
  if (robloxContainersBody) robloxContainersBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var c = ROBLOX_CONTAINERS.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    if (e.target.classList.contains('adm-roblox-edit')) {
      $('admRobloxContainerEditId').value = c.id;
      $('admRobloxContainerUniverseId').value = c.universe_id;
      $('admRobloxContainerLabel').value = c.label || '';
      $('admRobloxContainerFormTitle').textContent = 'Edit container game';
      $('admRobloxContainerSubmitBtn').textContent = 'Save changes';
      $('admRobloxContainerCancelBtn').hidden = false;
    } else if (e.target.classList.contains('adm-roblox-toggle')) {
      callUpsertRobloxContainer({ id: c.id, universeId: c.universe_id, label: c.label, active: !c.active }).then(function () {
        logAudit((c.active ? 'Disabled' : 'Enabled') + ' Roblox container ' + c.universe_id);
        return refreshRobloxContainers();
      }).catch(function (err) { alert(err.message || 'Could not update the container.'); });
    }
  });
  var robloxContainerCancelBtn = $('admRobloxContainerCancelBtn');
  if (robloxContainerCancelBtn) robloxContainerCancelBtn.addEventListener('click', resetRobloxContainerForm);
  var robloxContainerForm = $('admRobloxContainerForm');
  if (robloxContainerForm) robloxContainerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!can('admin')) return;
    var editId = $('admRobloxContainerEditId').value;
    var universeId = $('admRobloxContainerUniverseId').value.trim();
    var label = $('admRobloxContainerLabel').value.trim();
    if (!universeId) return;
    var submitBtn = $('admRobloxContainerSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    callUpsertRobloxContainer({ id: editId || undefined, universeId: universeId, label: label, active: true }).then(function () {
      logAudit((editId ? 'Updated' : 'Added') + ' Roblox container ' + universeId);
      resetRobloxContainerForm();
      return refreshRobloxContainers();
    }).catch(function (err) {
      var msg = $('admRobloxContainerMsg'); if (msg) msg.textContent = err.message || 'Could not save the container.';
    }).then(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
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
      cover: $('admNewPostCover').value.trim() || '/banner.jpg',
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
      cover: $('admNewTutCover').value.trim() || '/scripts.jpg',
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
  var ADM_DD_CHEV = '<svg class="adm-dd-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function renderStaff() {
    $('admStaffBody').innerHTML = STAFF.map(function (s) {
      var roleMenu = ['owner', 'admin', 'support'].map(function (r) {
        return '<button type="button" class="adm-dd-opt' + (r === s.role ? ' active' : '') + '" data-value="' + r + '" role="option" aria-selected="' + (r === s.role ? 'true' : 'false') + '"><span>' + r + '</span><span class="adm-dd-radio"></span></button>';
      }).join('');
      return '<tr data-id="' + s.id + '"><td>' + esc(s.name) + '</td><td class="dt-mono">' + esc(s.discordId || '—') + '</td>' +
        '<td><div class="adm-dd adm-dd-inline adm-staff-role-dd"' + (can('owner') ? '' : ' data-disabled="1"') + '>' +
          '<button type="button" class="adm-dd-btn"' + (can('owner') ? '' : ' disabled') + ' aria-haspopup="listbox" aria-expanded="false"><span class="adm-dd-val">' + esc(s.role) + '</span>' + ADM_DD_CHEV + '</button>' +
          '<div class="adm-dd-menu" role="listbox" aria-label="Role" hidden>' + roleMenu + '</div>' +
        '</div></td>' +
        '<td class="adm-row-actions">' + (can('owner') && STAFF.length > 1 ? '<button class="btn btn-ghost adm-btn-sm adm-staff-remove" type="button">Remove</button>' : '') + '</td></tr>';
    }).join('');
    $('admWhitelistNote').textContent = 'Whitelist enforced — only the Discord IDs set in supabase-init.js\'s ADMIN_WHITELIST can open this dashboard. This staff list is separate role-management data and isn\'t the enforcement source.';
  }
  var staffBody = $('admStaffBody');
  if (staffBody) staffBody.addEventListener('click', function (e) {
    var ddBtn = e.target.closest('.adm-staff-role-dd .adm-dd-btn');
    if (ddBtn) {
      if (ddBtn.disabled) return;
      var dd = ddBtn.closest('.adm-staff-role-dd');
      var menu = dd.querySelector('.adm-dd-menu');
      var wasOpen = !menu.hidden;
      staffBody.querySelectorAll('.adm-staff-role-dd').forEach(function (d) { d.classList.remove('open'); d.querySelector('.adm-dd-menu').hidden = true; });
      if (!wasOpen) { dd.classList.add('open'); menu.hidden = false; }
      return;
    }
    var opt = e.target.closest('.adm-staff-role-dd .adm-dd-opt');
    if (opt) {
      if (!can('owner')) return;
      var tr = opt.closest('tr'); var id = tr.getAttribute('data-id');
      var s = STAFF.filter(function (x) { return x.id === id; })[0]; if (!s) return;
      s.role = opt.getAttribute('data-value');
      saveStaff(); logAudit('Changed ' + s.name + '\'s role to ' + s.role); renderTopbar(); renderStaff();
      return;
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.adm-staff-role-dd')) return;
    document.querySelectorAll('.adm-staff-role-dd.open').forEach(function (d) { d.classList.remove('open'); d.querySelector('.adm-dd-menu').hidden = true; });
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
  var newStaffRoleDropdown = makeDropdown($('admNewStaffRoleDD'), { valueInput: $('admNewStaffRole') });
  newStaffRoleDropdown.setOptions([
    { value: 'support', label: 'Support agent' },
    { value: 'admin', label: 'Admin' },
    { value: 'owner', label: 'Owner' }
  ], 'support');
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
    addStaffForm.reset(); newStaffRoleDropdown.setValue('support', true); renderStaff();
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
  refreshProducts().then(function () { return refreshOrders(); });
  refreshCoupons();
  refreshRobloxContainers();
})();
