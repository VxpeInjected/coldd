(function () {
  'use strict';

  /* ================================================================
     ACCESS GATE
     Real check against the signed-in user's profiles.is_admin/role - the
     same flag every admin-* Edge Function checks server-side, not a
     separate client-side list. Async (needs a query), so the panel stays
     hidden until it resolves rather than optimistically showing it.
     ================================================================ */
  var gate = document.getElementById('admGate');
  var shell = document.getElementById('admShell');

  if (!window.coldAuth || !window.coldAuth.checkIsAdmin) {
    if (gate) gate.hidden = false;
    return;
  }
  window.coldAuth.checkIsAdmin().then(function (info) {
    if (!info.isAdmin) {
      if (gate) gate.hidden = false;
      if (shell) shell.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    boot(info);
  });

  function boot(ADMIN) {
  window.__ADMIN_ID = ADMIN.id;

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
  // Unlike robux(), which converts a USD figure into its Robux equivalent
  // for display, this formats a value that's already a real Robux amount
  // (e.g. websiteRevenue().robux, summed from orders.total_robux) - do not
  // multiply it by ROBUX_PER_USD again.
  function robuxRaw(n) { return 'R$ ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function pct(n) { return (Math.round((Number(n) || 0) * 10) / 10) + '%'; }
  // Real robux orders were actually charged in Robux (via a Roblox
  // gamepass, not our checkout) - showing usd(o.total) for them would
  // display the USD-equivalent record-keeping figure as if it were the
  // real charge. Order-history amounts are fixed historical facts, not
  // live prices, so this never routes through the flat-conversion
  // window.__robux() either.
  function orderAmount(o) { return o.currency === 'robux' ? ('R$ ' + Math.round(o.totalRobux).toLocaleString('en-US')) : usd(o.total); }
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
     LIVE DATA — users, referrals, traffic, and abandoned carts below
     are all read from Supabase (see refreshUsers/refreshAdminReferrals/
     refreshTraffic/refreshAbandoned), same as Orders/Coupons/Reviews/
     Roblox containers/Posts/Staff. lsGet/lsSet now only persist
     harmless per-browser UI prefs (sort order, date-range selector),
     not the panel data itself.
     ================================================================ */
  var CATALOG = window.__CATALOG || [];

  // Real data from public.profiles, read via the signed-in admin's own
  // session (RLS: profiles_select_admin lets is_admin=true profiles see
  // every profile, not just their own). Writes (ban/unban) go through
  // admin-set-user-banned (service role, re-checks is_admin server-side).
  var USERS = [];
  function mapProfileRow(row) {
    return {
      id: row.id,
      name: row.username || (row.email ? row.email.split('@')[0] : 'user'),
      email: row.email || '',
      joined: row.created_at || new Date().toISOString(),
      status: row.banned ? 'banned' : 'active',
      banReason: row.ban_reason || null,
      isAdmin: !!row.is_admin,
      discordId: row.discord_id || null,
      robloxId: row.roblox_id || null
    };
  }
  function refreshUsers() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load users:', res.error.message); return; }
      USERS = (res.data || []).map(mapProfileRow);
      if (curPanel === 'users') renderUsers();
    });
  }

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
  var SALE_EVENTS = [];
  function mapSaleEventRow(row) {
    return Object.assign({ id: row.id, slug: row.slug, active: row.visible }, row.data || {});
  }
  function refreshSaleEvents() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('content').select('*').eq('type', 'sale_event').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error('[admin] failed to load sale events:', res.error.message); return; }
      SALE_EVENTS = (res.data || []).map(mapSaleEventRow);
      if (curPanel === 'sales') renderEvents();
    });
  }

  // Real data from public.profiles (is_admin=true) - the same flag every
  // admin-* Edge Function checks server-side, not separate mock data.
  var STAFF = [];
  function refreshStaff() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('profiles').select('id, username, email, discord_id, role').eq('is_admin', true).then(function (res) {
      if (res.error) { console.error('[admin] failed to load staff:', res.error.message); return; }
      STAFF = (res.data || []).map(function (p) {
        return { id: p.id, name: p.username || (p.email ? p.email.split('@')[0] : 'user'), email: p.email, discordId: p.discord_id, role: p.role || 'admin' };
      });
      if (curPanel === 'sitemgmt') renderStaff();
    });
  }

  // Real data from public.profiles (referral_code/referred_by/referral_clicks)
  // and public.orders, read via the signed-in admin's own session. Earnings
  // are computed client-side (20% of each referred paid order, matching
  // REFERRAL_RATE server-side) since it's just a display aggregate, not a
  // ledger - the actual source of truth for payouts is referral_payouts.
  var REFERRALS = [];
  function refreshAdminReferrals() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('profiles').select('id, username, email, referral_code, referral_clicks, referred_by').limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load referrals:', res.error.message); return; }
      var rows = res.data || [];
      var referrers = rows.filter(function (p) { return p.referral_code; });
      return window.coldSupabase.from('referral_payouts').select('user_id, amount_usd, status').limit(20000).then(function (payRes) {
        var paidByUser = {};
        (payRes.data || []).forEach(function (pay) {
          if (pay.status !== 'paid') return;
          paidByUser[pay.user_id] = (paidByUser[pay.user_id] || 0) + Number(pay.amount_usd || 0);
        });
        REFERRALS = referrers.map(function (r) {
          var referredIds = rows.filter(function (p) { return p.referred_by === r.id; }).map(function (p) { return p.id; });
          var earnedUSD = 0;
          var convertedSet = {};
          ORDERS.forEach(function (o) {
            if (o.status !== 'completed' || referredIds.indexOf(o.userId) < 0) return;
            convertedSet[o.userId] = true;
            if (o.currency !== 'robux') earnedUSD += o.total * 0.2;
          });
          return {
            code: r.referral_code,
            owner: r.username || (r.email ? r.email.split('@')[0] : 'user'),
            clicks: r.referral_clicks || 0,
            signups: referredIds.length,
            conversions: Object.keys(convertedSet).length,
            earnedUSD: Math.round(earnedUSD * 100) / 100,
            paidUSD: Math.round((paidByUser[r.id] || 0) * 100) / 100
          };
        });
        if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
      });
    });
  }

  var PAYOUTS = [];
  function refreshPayouts() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('referral_payouts').select('*').order('requested_at', { ascending: false }).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load payouts:', res.error.message); return; }
      var rows = res.data || [];
      var userIds = rows.map(function (p) { return p.user_id; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
      function apply(byId) {
        PAYOUTS = rows.map(function (p) {
          var prof = byId[p.user_id];
          return Object.assign({ owner: prof ? (prof.username || prof.email || 'user') : 'user' }, p);
        });
        if (curPanel === 'analytics') renderPayouts();
        if (curPanel === 'home') renderHome();
      }
      if (!userIds.length) { apply({}); return; }
      return window.coldSupabase.from('profiles').select('id,username,email').in('id', userIds).then(function (pRes) {
        var byId = {};
        (pRes.data || []).forEach(function (p) { byId[p.id] = p; });
        apply(byId);
      });
    });
  }
  // Total earned-but-unpaid commission across every 'requested' payout,
  // converted to a single USD figure (robux via the real DevEx rate, same
  // as everywhere else money gets compared across currencies) so it can be
  // shown as one AUD number. store_credit counts too - it's commission
  // already earned and awaiting fulfillment, not yet a null cost just
  // because it isn't a bank transfer.
  function referralsOwedInfo() {
    var requested = PAYOUTS.filter(function (p) { return p.status === 'requested'; });
    var usdTotal = requested.reduce(function (sum, p) {
      return sum + (p.method === 'robux' ? (p.amount_robux || 0) * DEVEX_USD_PER_ROBUX : (p.amount_usd || 0));
    }, 0);
    var names = requested.map(function (p) { return p.owner; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    return { usdTotal: usdTotal, count: requested.length, names: names };
  }
  function renderPayouts() {
    var el = $('admPayoutsBody'); if (!el) return;
    el.innerHTML = PAYOUTS.map(function (p) {
      var amount = p.method === 'robux' ? (Math.round(p.amount_robux || 0) + ' R$') : usd(p.amount_usd || 0);
      var method = p.method === 'usd' ? 'USD' : p.method === 'robux' ? 'Robux' : 'Store credit';
      var status = p.status === 'paid' ? '<span class="dt-badge ok">Paid</span>' : p.status === 'denied' ? '<span class="dt-badge err">Denied</span>' : '<span class="dt-badge warn">Requested</span>';
      var actions = p.status === 'requested' && can('admin')
        ? '<button class="btn btn-ghost adm-btn-sm adm-payout-paid" type="button">Mark paid</button><button class="btn btn-ghost adm-btn-sm adm-payout-deny" type="button">Deny</button>'
        : '';
      return '<tr data-id="' + p.id + '"><td>' + fmtDateTime(new Date(p.requested_at)) + '</td><td>' + esc(p.owner) + '</td><td>' + method + '</td><td>' + amount + '</td><td>' + status + '</td><td class="adm-row-actions">' + actions + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No payout requests yet.</td></tr>';
  }
  function callManageReferralPayout(id, action) {
    return invokeAdminFn('admin-manage-referral-payout', { id: id, action: action }, 'Could not update payout.');
  }
  var payoutsBody = $('admPayoutsBody');
  if (payoutsBody) payoutsBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var p = PAYOUTS.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (!can('admin')) return;
    if (e.target.classList.contains('adm-payout-paid')) {
      if (!confirm('Mark this payout as sent to ' + p.owner + '?')) return;
      callManageReferralPayout(id, 'mark_paid')
        .then(function () { logAudit('Marked referral payout to ' + p.owner + ' as paid'); return Promise.all([refreshPayouts(), refreshAdminReferrals()]); })
        .catch(function (err) { alert(err.message || 'Could not update payout.'); });
    } else if (e.target.classList.contains('adm-payout-deny')) {
      if (!confirm('Deny this payout request from ' + p.owner + '?')) return;
      callManageReferralPayout(id, 'deny')
        .then(function () { logAudit('Denied referral payout request from ' + p.owner); return refreshPayouts(); })
        .catch(function (err) { alert(err.message || 'Could not update payout.'); });
    }
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
      totalRobux: Number(row.total_robux) || 0,
      currency: row.currency || 'usd',
      status: status,
      refCode: null,
      refundReason: row.refund_reason || null,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      source: row.source || 'website',
      items: items
    };
  }
  function refreshOrders() {
    if (!window.coldSupabase) return Promise.resolve();
    // Excludes 'parcel'/'robux' source rows - synthetic order records the
    // reverted Roblox group-revenue-sync feature wrote during testing (see
    // supabase/roblox_group_sync_teardown.sql, which deleted the ones that
    // had already accumulated). Belt-and-suspenders: keeps this list real
    // even if that function is ever re-invoked without being re-enabled here.
    return window.coldSupabase.from('orders').select('*, order_items(*)').not('source', 'in', '("parcel","robux")').order('created_at', { ascending: false }).limit(20000).then(function (res) {
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

  // Real data from public.reviews, read via the signed-in admin's own
  // session (RLS: reviews_select_admin). Writes (approve/hide/reply) go
  // through admin-moderate-review (service role).
  var REVIEWS = [];
  function mapReviewRow(row, profile) {
    return {
      id: row.id,
      dbId: row.id,
      productId: row.products ? row.products.slug : null,
      productTitle: row.products ? row.products.title : 'Unknown product',
      user: profile ? (profile.username || profile.email || 'user') : 'user',
      stars: row.stars,
      text: row.text,
      date: row.created_at,
      status: row.status,
      reply: row.reply ? { text: row.reply, date: row.reply_at } : null
    };
  }
  function refreshReviews() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('reviews').select('*, products(title, slug)').order('created_at', { ascending: false }).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load reviews:', res.error.message); return; }
      var rows = res.data || [];
      var userIds = rows.map(function (r) { return r.user_id; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
      function apply(byId) {
        REVIEWS = rows.map(function (r) { return mapReviewRow(r, byId[r.user_id]); });
        if (curPanel === 'reviews') renderReviews();
        if (curPanel === 'home') renderHome();
      }
      if (!userIds.length) { apply({}); return; }
      return window.coldSupabase.from('profiles').select('id,username,email').in('id', userIds).then(function (pRes) {
        var byId = {};
        (pRes.data || []).forEach(function (p) { byId[p.id] = p; });
        apply(byId);
      });
    });
  }
  function callModerateReview(id, action, reply) {
    var body = { id: id, action: action };
    if (reply != null) body.reply = reply;
    return invokeAdminFn('admin-moderate-review', body, 'Could not update review.');
  }

  // Real data from public.page_views (a row per page load, no PII - see
  // catalog.js's trackPageview beacon), read via the signed-in admin's own
  // session (RLS: page_views_select_admin). Grouped into one {date,
  // sessions, pageviews} bucket per day client-side.
  var TRAFFIC = [];
  function refreshTraffic() {
    if (!window.coldSupabase) return Promise.resolve();
    var cutoff = daysAgo(119).toISOString();
    return window.coldSupabase.from('page_views').select('session_id, created_at').gte('created_at', cutoff).limit(50000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load traffic:', res.error.message); return; }
      var byDay = {};
      (res.data || []).forEach(function (row) {
        var day = row.created_at.slice(0, 10);
        if (!byDay[day]) byDay[day] = { pageviews: 0, sessions: {} };
        byDay[day].pageviews++;
        byDay[day].sessions[row.session_id] = true;
      });
      var out = [];
      for (var d = 119; d >= 0; d--) {
        var iso = daysAgo(d).toISOString();
        var key = iso.slice(0, 10);
        var bucket = byDay[key];
        out.push({ date: iso, sessions: bucket ? Object.keys(bucket.sessions).length : 0, pageviews: bucket ? bucket.pageviews : 0 });
      }
      TRAFFIC = out;
      if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
      if (curPanel === 'home') renderHome();
    });
  }

  var LIVE_SESSIONS = 0;
  function refreshLiveSessions() {
    if (!window.coldSupabase) return Promise.resolve();
    var cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    return window.coldSupabase.from('page_views').select('session_id').gte('created_at', cutoff).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load live sessions:', res.error.message); return; }
      var set = {}; (res.data || []).forEach(function (r) { set[r.session_id] = true; });
      LIVE_SESSIONS = Object.keys(set).length;
      if (curPanel === 'home') renderHome();
      if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
    });
  }

  var DISCORD_STATS = { memberCount: null, onlineCount: null, history: [] };
  function refreshDiscordStats() {
    return invokeAdminFn('admin-discord-stats', {}, 'Could not load Discord stats.').then(function (data) {
      DISCORD_STATS = { memberCount: data.memberCount, onlineCount: data.onlineCount, history: data.history || [] };
      if (curPanel === 'home') renderHome();
      if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
    }).catch(function (err) { console.error('[admin] discord stats:', err.message); });
  }
  // Net members gained/lost since the start of the selected range. Discord's
  // API has no history of its own - only ever the current total - so this
  // diffs against our own daily snapshots (discord_member_snapshots,
  // populated by admin-discord-stats itself). Returns null (not 0) when
  // there's no snapshot at or before the range start, since that means
  // "we don't know yet", not "no change".
  function discordJoinsInRange() {
    if (DISCORD_STATS.memberCount == null || !DISCORD_STATS.history.length) return null;
    var startKey = (RANGE_DAYS ? daysAgoStart(RANGE_DAYS) : new Date(DISCORD_STATS.history[0].snapshot_date)).toISOString().slice(0, 10);
    var baseline = null;
    for (var i = 0; i < DISCORD_STATS.history.length; i++) {
      if (DISCORD_STATS.history[i].snapshot_date <= startKey) baseline = DISCORD_STATS.history[i].member_count;
      else break;
    }
    if (baseline == null) return null;
    return DISCORD_STATS.memberCount - baseline;
  }

  var ADBLOX_STATS = null;
  var ADBLOX_ERROR = null;
  var ADBLOX_SERVERS = [];
  var ADBLOX_LOGS = [];
  var ADBLOX_NEXT_CURSOR = null;
  function refreshAdbloxStats() {
    return invokeAdminFn('admin-adblox-stats', {}, 'Could not load AdBlox stats.').then(function (data) {
      ADBLOX_STATS = data; ADBLOX_ERROR = null;
      ADBLOX_SERVERS = data.servers || [];
      ADBLOX_LOGS = data.logs || [];
      ADBLOX_NEXT_CURSOR = data.nextLogCursor || null;
      if (curPanel === 'marketing') renderMarketing();
    }).catch(function (err) {
      ADBLOX_STATS = null; ADBLOX_ERROR = err.message;
      ADBLOX_SERVERS = []; ADBLOX_LOGS = []; ADBLOX_NEXT_CURSOR = null;
      if (curPanel === 'marketing') renderMarketing();
    });
  }
  // Appends the next page of the audit log rather than replacing it, so
  // "Load more" grows the table instead of resetting scroll position.
  function loadMoreAdbloxLogs() {
    if (!ADBLOX_NEXT_CURSOR) return Promise.resolve();
    return invokeAdminFn('admin-adblox-stats', { logCursor: ADBLOX_NEXT_CURSOR }, 'Could not load more activity.').then(function (data) {
      ADBLOX_LOGS = ADBLOX_LOGS.concat(data.logs || []);
      ADBLOX_NEXT_CURSOR = data.nextLogCursor || null;
      if (curPanel === 'marketing') renderMarketing();
    });
  }

  // Real data from public.cart_snapshots - a row per checkout-page visit
  // with items in cart, deleted the moment an order actually gets created
  // (see app.js's deleteCartSnapshot()). Anything still here is, by
  // definition, an abandoned cart.
  var ABANDONED = [];
  function refreshAbandoned() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('cart_snapshots').select('*').order('updated_at', { ascending: false }).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load abandoned carts:', res.error.message); return; }
      ABANDONED = (res.data || []).map(function (row) {
        var items = row.items || [];
        var first = items[0] || {};
        var title = items.length > 1 ? ((first.title || 'Item') + ' +' + (items.length - 1) + ' more') : (first.title || 'Unknown item');
        return { id: row.session_id, date: row.updated_at, title: title, image: first.image || '', value: Number(row.value_usd) || 0, email: row.email || null };
      });
      if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
    });
  }

  // Real data from public.admin_audit_log (see supabase/admin_audit_log.sql)
  // - shared across every admin's browser, not per-device localStorage.
  var AUDIT = [];
  var AUDIT_PERSIST_ERROR = null;

  function logAudit(action) {
    var entry = { ts: new Date().toISOString(), actor: currentRole().name, action: action };
    AUDIT.unshift(entry);
    if (AUDIT.length > 300) AUDIT.length = 300;
    if (curPanel === 'audit') renderAudit();
    window.coldSupabase.from('admin_audit_log').insert({
      actor_id: ADMIN.id, actor_name: entry.actor, action: action
    }).then(function (res) {
      if (res.error) {
        console.error('[logAudit] failed to persist:', res.error.message);
        // Silently falling back to the in-memory copy is how this ends up
        // looking like a session-only log: the entries are right there on
        // screen, they just evaporate on reload. Say so instead.
        AUDIT_PERSIST_ERROR = res.error.message || 'unknown error';
        if (curPanel === 'audit') renderAudit();
      }
    });
  }

  function refreshAuditLog() {
    return window.coldSupabase.from('admin_audit_log')
      .select('actor_name, action, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(function (res) {
        if (res.error) {
          console.error('[refreshAuditLog] failed:', res.error.message);
          AUDIT_PERSIST_ERROR = res.error.message || 'unknown error';
          if (curPanel === 'audit') renderAudit();
          return;
        }
        AUDIT_PERSIST_ERROR = null;
        AUDIT = (res.data || []).map(function (row) {
          return { ts: row.created_at, actor: row.actor_name, action: row.action };
        });
        if (curPanel === 'audit') renderAudit();
      });
  }

  /* ================================================================
     ROLE - real, from profiles.is_admin/role (ADMIN, resolved by the
     access gate above before boot() ever runs).
     ================================================================ */
  var ROLES = { owner: 3, admin: 2, support: 1 };
  function currentRole() { return { name: ADMIN.username || 'You', role: ADMIN.role || 'admin' }; }
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
      storagePath: row.storage_path || '',
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
  // The window immediately before the current range, same length - e.g.
  // for the last 7 days, this is the 7 days before that. No meaningful
  // comparison for "All time", so callers should skip % change there.
  function prevRangeWindow() {
    var n = RANGE_DAYS || 1;
    var end = daysAgoStart(n);
    var start = daysAgoStart(n * 2);
    return { start: start, end: end };
  }
  function pctDelta(cur, prev) {
    if (!RANGE_DAYS) return '';
    if (!prev) return cur ? '<span class="ds-delta up">▲ New</span>' : '';
    var pct = ((cur - prev) / prev) * 100;
    var cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
    var arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '—';
    return '<span class="ds-delta ' + cls + '">' + arrow + ' ' + Math.abs(Math.round(pct * 10) / 10) + '%</span>';
  }
  function setRange(n) {
    RANGE_DAYS = n; lsSet('coldd_admin_range_v1', n);
    document.querySelectorAll('.adm-range button').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-range') === n); });
    if (curPanel === 'analytics') renderAnalytics();
    if (curPanel === 'marketing') renderMarketing();
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
      var tipText = esc(d.label) + ': ' + esc(d.tip != null ? d.tip : d.v);
      return '<rect class="adm-chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (opts.color || 'var(--accent)') + '" opacity="' + op.toFixed(2) + '" data-tip="' + tipText + '"><title>' + tipText + '</title></rect>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="adm-chart" preserveAspectRatio="none">' + bars + '</svg>';
  }

  // Shared floating tooltip for chart bars - the native SVG <title> tooltip
  // is slow to appear and unstyled, so this reads the same data-tip and
  // follows the cursor instead. Call once per rendered chart container.
  var chartTip = null;
  function chartTipEl() {
    if (!chartTip) {
      chartTip = document.createElement('div');
      chartTip.className = 'adm-chart-tip';
      chartTip.hidden = true;
      document.body.appendChild(chartTip);
    }
    return chartTip;
  }
  function attachChartTooltip(container) {
    if (!container || container._tipBound) return;
    container._tipBound = true;
    var tip = chartTipEl();
    container.addEventListener('mousemove', function (e) {
      var bar = e.target.closest && e.target.closest('.adm-chart-bar');
      if (!bar) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.textContent = bar.getAttribute('data-tip');
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
      bar.classList.add('hover');
      container.querySelectorAll('.adm-chart-bar.hover').forEach(function (b) { if (b !== bar) b.classList.remove('hover'); });
    });
    container.addEventListener('mouseleave', function () {
      tip.hidden = true;
      container.querySelectorAll('.adm-chart-bar.hover').forEach(function (b) { b.classList.remove('hover'); });
    });
  }

  /* ================================================================
     AGGREGATION (all computed live from ORDERS for the active range)
     ================================================================ */
  function ordersInRange() { return ORDERS.filter(function (o) { return inRange(o.date); }); }
  function completedInRange() { return ordersInRange().filter(function (o) { return o.status === 'completed'; }); }
  function completedInWindow(start, end) {
    return ORDERS.filter(function (o) { var d = new Date(o.date); return o.status === 'completed' && d >= start && d < end; });
  }
  // Real USD and real Robux totals (not the USD-equivalent record-keeping
  // figure robux orders also carry) - for revenue stat tiles, not display
  // of any single order's actual charge.
  function websiteRevenue(list) {
    var usdTotal = 0, robuxTotal = 0;
    list.forEach(function (o) { if (o.currency === 'robux') robuxTotal += o.totalRobux; else usdTotal += o.total; });
    return { usd: usdTotal, robux: robuxTotal };
  }
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
  var PANELS = ['home', 'analytics', 'marketing', 'products', 'product-edit', 'product-update', 'orders', 'refunds', 'reviews', 'users', 'sales', 'sitemgmt', 'content', 'audit'];
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
    else if (name === 'marketing') renderMarketing();
    else if (name === 'products') renderProducts();
    else if (name === 'orders') renderOrders();
    else if (name === 'refunds') renderRefunds();
    else if (name === 'reviews') renderReviews();
    else if (name === 'users') renderUsers();
    else if (name === 'sales') { renderEvents(); renderCoupons(); }
    else if (name === 'sitemgmt') { refreshSiteStatus(); renderRobloxContainers(); refreshRobloxCookieHealth(); refreshRobloxPool(); renderStaff(); }
    else if (name === 'content') { renderPosts(); renderTutorials(); renderReleases(); }
    else if (name === 'audit') { renderAudit(); refreshAuditLog(); }
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
    var label = $('admViewerLabel'); if (label) label.textContent = r.name || 'Signed in';
    // Set here rather than in renderHome(), which left this blank on every
    // panel except the dashboard.
    var role = $('admModeBanner'); if (role) role.textContent = r.role || '';
    var av = $('admAvatar'); if (av) av.textContent = (r.name || 'A').charAt(0).toUpperCase();
  }

  document.querySelectorAll('.adm-range button').forEach(function (b) {
    b.addEventListener('click', function () { setRange(+b.getAttribute('data-range')); });
  });

  /* ================================================================
     HOME PANEL
     ================================================================ */
  function pageviewsInWindow(start, end) {
    return TRAFFIC.filter(function (r) { var d = new Date(r.date); return d >= start && d < end; }).reduce(function (s, r) { return s + r.pageviews; }, 0);
  }
  function statTile(label, main, sub, deltaHtml, opts) {
    opts = opts || {};
    var attrs = opts.panel ? ' data-panel="' + esc(opts.panel) + '" style="cursor:pointer;"' : '';
    var title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    return '<div class="dash-stat glass"' + attrs + title + '><span class="ds-label">' + esc(label) + '</span><span class="ds-num">' + main + '</span>' +
      (sub ? '<span class="ds-sub">' + sub + '</span>' : '') + (deltaHtml || '') + '</div>';
  }
  function renderHome() {
    var curOrders = completedInRange();
    var curRev = websiteRevenue(curOrders);
    var win = RANGE_DAYS ? prevRangeWindow() : null;
    var prevOrders = win ? completedInWindow(win.start, win.end) : [];
    var prevRev = websiteRevenue(prevOrders);

    var curVisits = RANGE_DAYS ? pageviewsInWindow(daysAgoStart(RANGE_DAYS), new Date()) : TRAFFIC.reduce(function (s, r) { return s + r.pageviews; }, 0);
    var prevVisits = win ? pageviewsInWindow(win.start, win.end) : 0;

    // "Overall" and "Website" were both computed from the same websiteRevenue()
    // call, so the dashboard showed each figure twice under two names and
    // implied an off-site revenue stream that is not tracked anywhere. One
    // set of numbers, named for what they are.
    $('admHomeStatsTop').innerHTML = [
      statTile('Revenue', aud(curRev.usd), usd(curRev.usd) + ' USD', pctDelta(curRev.usd, prevRev.usd)),
      statTile('Robux revenue', robuxRaw(curRev.robux), null, pctDelta(curRev.robux, prevRev.robux)),
      statTile('Order count', curOrders.length, null, pctDelta(curOrders.length, prevOrders.length)),
      statTile('Site visits', curVisits.toLocaleString('en-US'), null, pctDelta(curVisits, prevVisits))
    ].join('');

    var joins = discordJoinsInRange();
    var owed = referralsOwedInfo();
    $('admHomeStatsSecondary').innerHTML = [
      statTile('Live sessions', LIVE_SESSIONS, 'active in the last 5 min', ''),
      statTile('Discord members', DISCORD_STATS.memberCount != null ? DISCORD_STATS.memberCount.toLocaleString('en-US') : '—', DISCORD_STATS.onlineCount != null ? (DISCORD_STATS.onlineCount.toLocaleString('en-US') + ' online') : '', ''),
      statTile('Discord joins', joins == null ? '—' : (joins > 0 ? '+' : '') + joins.toLocaleString('en-US'), joins == null ? 'Gathering history' : (RANGE_DAYS ? 'net over selected range' : 'net since tracking began'), ''),
      statTile('Referrals owed', aud(owed.usdTotal), owed.count ? (owed.count + ' request' + (owed.count === 1 ? '' : 's') + ' pending') : 'Nothing pending', '', { panel: 'analytics', title: owed.names.length ? 'Requested by: ' + owed.names.join(', ') : '' })
    ].join('');

    var todo = [];
    var pendingReviews = REVIEWS.filter(function (r) { return r.status === 'pending'; }).length;
    if (pendingReviews) todo.push({ text: pendingReviews + ' review' + (pendingReviews > 1 ? 's' : '') + ' awaiting moderation', panel: 'reviews', badge: 'warn' });
    var pendingPayouts = PAYOUTS.filter(function (p) { return p.status === 'requested'; }).length;
    if (pendingPayouts) todo.push({ text: pendingPayouts + ' referral payout request' + (pendingPayouts > 1 ? 's' : '') + ' pending', panel: 'analytics', badge: 'warn' });
    if (ROBLOX_COOKIE_BROKEN) todo.push({ text: 'Robux fallback cookie is broken - group-transaction verification won\'t work until it\'s refreshed', panel: 'sitemgmt', badge: 'err' });
    if (ROBLOX_CONTAINERS.length && ROBLOX_CONTAINERS.every(function (c) { return !c.active || c.gamepass_count >= 50; })) {
      todo.push({ text: 'All Roblox container games are full - add a new one before creating more Robux products', panel: 'sitemgmt', badge: 'err' });
    }
    $('admHomeTodo').innerHTML = todo.length ? todo.map(function (t) {
      return '<div class="adm-todo-row"><span class="adm-todo-text">' + esc(t.text) + '</span><a href="#" class="btn btn-ghost adm-btn-sm" data-panel="' + t.panel + '">Review</a></div>';
    }).join('') : '<p class="adm-empty">Nothing needs your attention right now.</p>';

    var recent = ORDERS.filter(function (o) { return o.status === 'completed'; }).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 6);
    $('admHomeRecent').innerHTML = recent.map(orderRowHTML).join('') || '<p class="adm-empty">No completed orders yet.</p>';

  }
  function orderRowHTML(o) {
    return '<div class="dash-row"><span class="dr-thumb" style="background-image:url(\'' + o.image + '\')"></span>' +
      '<div class="dr-main"><div class="dr-title">' + esc(o.title) + '</div><div class="dr-sub">' + fmtDateTime(new Date(o.date)) + ' · ' + esc(o.id) + ' · ' + esc(o.userName) + '</div></div>' +
      statusBadge(o.status) + '<span class="p-price" style="margin-left:12px;">' + orderAmount(o) + '</span></div>';
  }
  function statusBadge(status) {
    var cls = status === 'completed' ? 'ok' : (status === 'refunded' ? 'err' : 'warn');
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    return '<span class="dt-badge ' + cls + '">' + label + '</span>';
  }

  /* ================================================================
     MARKETING PANEL

     Split out of Analytics, which had grown to hold two unrelated jobs:
     how the store is performing, and how the audience is reached. The
     channel and email blocks state plainly that nothing is connected yet
     rather than rendering invented numbers.
     ================================================================ */
  var MKT_CHANNELS = [
    { key: 'discord', name: 'Discord', note: 'Member and presence counts.' },
    { key: 'x', name: 'X (Twitter)', note: 'Followers, impressions, post reach.' },
    { key: 'youtube', name: 'YouTube', note: 'Subscribers, views, watch time.' },
    { key: 'tiktok', name: 'TikTok', note: 'Followers and video views.' }
  ];

  function channelRow(c) {
    var connected = false, value = '', sub = c.note;
    if (c.key === 'discord' && DISCORD_STATS.memberCount != null) {
      connected = true;
      value = DISCORD_STATS.memberCount.toLocaleString('en-US') + ' members';
      sub = (DISCORD_STATS.onlineCount != null ? DISCORD_STATS.onlineCount.toLocaleString('en-US') + ' online' : c.note);
    }
    return '<div class="adm-channel-row">' +
      '<div class="adm-channel-main"><span class="adm-channel-name">' + esc(c.name) + '</span>' +
      '<span class="adm-sub">' + esc(sub) + '</span></div>' +
      (connected
        ? '<span class="adm-channel-val">' + esc(value) + '</span><span class="dt-badge ok">Connected</span>'
        : '<span class="dt-badge">Not connected</span>') +
      '</div>';
  }

  function renderMarketing() {
    var signups = REFERRALS.reduce(function (s, r) { return s + r.signups; }, 0);
    var clicks = REFERRALS.reduce(function (s, r) { return s + r.clicks; }, 0);
    var conversions = REFERRALS.reduce(function (s, r) { return s + r.conversions; }, 0);
    var owed = REFERRALS.reduce(function (s, r) { return s + (r.earnedUSD - r.paidUSD); }, 0);

    if ($('admMktStats')) {
      $('admMktStats').innerHTML = [
        statTile('Discord members', DISCORD_STATS.memberCount != null ? DISCORD_STATS.memberCount.toLocaleString('en-US') : '—', DISCORD_STATS.onlineCount != null ? (DISCORD_STATS.onlineCount.toLocaleString('en-US') + ' online') : '', ''),
        statTile('Referral clicks', clicks.toLocaleString('en-US'), null, ''),
        statTile('Referral signups', signups.toLocaleString('en-US'), null, ''),
        statTile('Owed to affiliates', usd(owed), null, '')
      ].join('');
    }

    if ($('admMktChannels')) {
      $('admMktChannels').innerHTML = MKT_CHANNELS.map(channelRow).join('');
    }

    if ($('admAdbloxStats')) {
      var adMsg = $('admAdbloxMsg');
      if (ADBLOX_STATS) {
        if (adMsg) adMsg.textContent = '';
        var s = ADBLOX_STATS.sent;
        $('admAdbloxStats').innerHTML = [
          statTile('Ads sent today', (s ? s.today : 0).toLocaleString('en-US'), s ? (s.yesterday.toLocaleString('en-US') + ' yesterday') : null, ''),
          statTile('Ads sent (7d)', (s ? s.last_7d : 0).toLocaleString('en-US'), null, ''),
          statTile('Ads sent (30d)', (s ? s.last_30d : 0).toLocaleString('en-US'), null, ''),
          statTile('Ads sent (all-time)', (s ? s.all_time : 0).toLocaleString('en-US'), null, '')
        ].join('');
      } else {
        $('admAdbloxStats').innerHTML = '';
        if (adMsg) adMsg.textContent = ADBLOX_ERROR || 'Loading…';
      }
    }

    if ($('admAdbloxServersBody')) {
      var serversSorted = ADBLOX_SERVERS.slice().sort(function (a, b) { return (b.sent || 0) - (a.sent || 0); });
      $('admAdbloxServersBody').innerHTML = serversSorted.map(function (sv) {
        return '<tr><td>' +
          (sv.guild_icon_url ? '<span style="background-image:url(\'' + esc(sv.guild_icon_url) + '\');background-size:cover;width:20px;height:20px;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:8px;"></span>' : '') +
          esc(sv.guild_name || sv.guild_id) + '</td>' +
          '<td>' + (sv.sent || 0).toLocaleString('en-US') + '</td>' +
          '<td>' + (sv.failed ? esc(sv.failed) : '0') + '</td>' +
          '<td>' + (sv.last_sent_at ? fmtDateTime(new Date(sv.last_sent_at)) : '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="adm-empty">No server activity yet.</td></tr>';
    }

    if ($('admAdbloxLogsBody')) {
      $('admAdbloxLogsBody').innerHTML = ADBLOX_LOGS.map(function (lg) {
        var status = lg.status === 'sent' ? '<span class="dt-badge ok">Sent</span>' : lg.status === 'failed' ? '<span class="dt-badge err">Failed</span>' : '<span class="dt-badge warn">' + esc(lg.status) + '</span>';
        return '<tr><td>' + (lg.sent_at ? fmtDateTime(new Date(lg.sent_at)) : '—') + '</td>' +
          '<td>' + esc(lg.ad_title || '') + '</td>' +
          '<td>' + esc(lg.guild_name || lg.guild_id || '') + '</td>' +
          '<td>' + esc(lg.channel_name || lg.channel_id || '') + '</td>' +
          '<td>' + status + (lg.error_message ? ' <span class="adm-sub" title="' + esc(lg.error_message) + '">⚠</span>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="adm-empty">No activity yet.</td></tr>';
      var loadMoreBtn = $('admAdbloxLoadMore');
      if (loadMoreBtn) loadMoreBtn.hidden = !ADBLOX_NEXT_CURSOR;
    }

    renderEmailMarketing();

    if ($('admReferralBody')) {
      $('admReferralBody').innerHTML = REFERRALS.map(function (r) {
        var rate = r.clicks ? (r.conversions / r.clicks * 100) : 0;
        return '<tr><td class="dt-mono">' + esc(r.code) + '</td><td>' + esc(r.owner) + '</td><td>' + r.clicks + '</td><td>' + r.signups + '</td><td>' + r.conversions + '</td><td>' + pct(rate) + '</td><td>' + usd(r.earnedUSD) + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="adm-empty">No referral codes yet.</td></tr>';
      if ($('admAffiliateOwed')) $('admAffiliateOwed').textContent = usd(owed);
      renderPayouts();
    }
    void conversions;
  }

  /* ================================================================
     EMAIL MARKETING (part of the Marketing panel)
     ================================================================ */
  var EMAIL_STATS = { total: 0, subscribed: 0, unsubscribed: 0 };
  var EMAIL_CAMPAIGNS = [];
  var EMAIL_CONFIGURED = null; // null = not checked yet

  function refreshEmailStats() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('profiles').select('marketing_unsubscribed').limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load subscriber stats:', res.error.message); return; }
      var rows = res.data || [];
      var unsub = rows.filter(function (r) { return r.marketing_unsubscribed; }).length;
      EMAIL_STATS = { total: rows.length, subscribed: rows.length - unsub, unsubscribed: unsub };
      if (curPanel === 'marketing') renderEmailMarketing();
    });
  }
  function refreshEmailCampaigns() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(200).then(function (res) {
      if (res.error) { console.error('[admin] failed to load campaigns:', res.error.message); return; }
      EMAIL_CAMPAIGNS = res.data || [];
      if (curPanel === 'marketing') renderEmailMarketing();
    });
  }
  function refreshEmailConfigStatus() {
    return invokeAdminFn('admin-send-campaign', { action: 'status' }, '').then(function (data) {
      EMAIL_CONFIGURED = !!data.configured;
      if (curPanel === 'marketing') renderEmailMarketing();
    }).catch(function () { EMAIL_CONFIGURED = null; });
  }

  // Minimal formatting for campaign bodies: blank line = new paragraph,
  // **bold**. Anything richer would need a real editor, which this doesn't
  // have yet - this covers the actual shape of a newsletter/announcement.
  function simpleMarkdownToHtml(text) {
    var paras = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
    return paras.map(function (p) {
      var line = esc(p.trim()).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return line ? '<p style="margin:0 0 16px;">' + line + '</p>' : '';
    }).join('');
  }

  function renderEmailMarketing() {
    var warnEl = $('admEmailConfigWarning');
    if (warnEl) {
      warnEl.innerHTML = EMAIL_CONFIGURED === false
        ? '<div class="dt-badge err" style="display:inline-block;margin-bottom:14px;">Email sending is not configured - set the RESEND_API_KEY secret to enable sends.</div>'
        : '';
    }

    if ($('admEmailStats')) {
      $('admEmailStats').innerHTML = [
        statTile('Total accounts', EMAIL_STATS.total.toLocaleString('en-US'), null, ''),
        statTile('Subscribed', EMAIL_STATS.subscribed.toLocaleString('en-US'), 'opted in by default', ''),
        statTile('Unsubscribed', EMAIL_STATS.unsubscribed.toLocaleString('en-US'), null, '')
      ].join('');
    }

    var body = $('admCampaignsBody');
    if (body) {
      body.innerHTML = EMAIL_CAMPAIGNS.map(function (c) {
        var status = c.status === 'sent' ? '<span class="dt-badge ok">Sent</span>' : c.status === 'failed' ? '<span class="dt-badge err">Failed</span>' : c.status === 'sending' ? '<span class="dt-badge warn">Sending</span>' : '<span class="dt-badge">Draft</span>';
        return '<tr><td>' + fmtDateTime(new Date(c.created_at)) + '</td><td>' + esc(c.subject) + '</td><td>' + status + '</td><td>' + (c.sent_count || 0) + ' / ' + (c.recipient_count || 0) + '</td><td>' + (c.failed_count || 0) + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="adm-empty">No campaigns sent yet.</td></tr>';
    }
  }

  var campaignForm = $('admCampaignForm');
  if (campaignForm) {
    campaignForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var subject = $('admCampaignSubject').value.trim();
      var bodyText = $('admCampaignBody').value;
      var msg = $('admCampaignMsg');
      if (!subject || !bodyText.trim()) { if (msg) msg.textContent = 'Write a subject and body first.'; return; }
      var count = EMAIL_STATS.subscribed || 0;
      if (!confirm('Send "' + subject + '" to ' + count + ' subscribed account' + (count === 1 ? '' : 's') + '? This cannot be undone.')) return;

      var sendBtn = $('admCampaignSendBtn');
      sendBtn.disabled = true;
      if (msg) msg.textContent = 'Sending…';
      invokeAdminFn('admin-send-campaign', { action: 'send', subject: subject, bodyHtml: simpleMarkdownToHtml(bodyText) }, 'Could not send campaign.').then(function (data) {
        if (msg) msg.textContent = 'Sent to ' + data.sentCount + ' of ' + data.recipientCount + (data.failedCount ? ' (' + data.failedCount + ' failed)' : '') + '.';
        logAudit('Sent email campaign "' + subject + '" to ' + data.sentCount + ' recipients');
        campaignForm.reset();
        return refreshEmailCampaigns();
      }).catch(function (err) {
        if (msg) msg.textContent = err.message;
      }).then(function () {
        sendBtn.disabled = false;
      });
    });
  }
  var campaignTestBtn = $('admCampaignTestBtn');
  if (campaignTestBtn) campaignTestBtn.addEventListener('click', function () {
    var subject = $('admCampaignSubject').value.trim();
    var bodyText = $('admCampaignBody').value;
    var testEmail = $('admCampaignTestEmail').value.trim();
    var msg = $('admCampaignMsg');
    if (!subject || !bodyText.trim()) { if (msg) msg.textContent = 'Write a subject and body first.'; return; }
    if (!testEmail) { if (msg) msg.textContent = 'Enter a test email address.'; return; }
    campaignTestBtn.disabled = true;
    if (msg) msg.textContent = 'Sending test…';
    invokeAdminFn('admin-send-campaign', { action: 'test', subject: subject, bodyHtml: simpleMarkdownToHtml(bodyText), testEmail: testEmail }, 'Could not send test.').then(function () {
      if (msg) msg.textContent = 'Test sent to ' + testEmail + '.';
    }).catch(function (err) {
      if (msg) msg.textContent = err.message;
    }).then(function () {
      campaignTestBtn.disabled = false;
    });
  });

  /* ================================================================
     ANALYTICS PANEL
     ================================================================ */
  function renderAnalytics() {
    var aov = avgOrderValue();
    var conv = conversionRate();

    var curOrders = completedInRange();
    var curRev = websiteRevenue(curOrders);
    var win = RANGE_DAYS ? prevRangeWindow() : null;
    var prevOrders = win ? completedInWindow(win.start, win.end) : [];
    var prevRev = websiteRevenue(prevOrders);
    var curVisits = RANGE_DAYS ? pageviewsInWindow(daysAgoStart(RANGE_DAYS), new Date()) : TRAFFIC.reduce(function (s, r) { return s + r.pageviews; }, 0);
    var prevVisits = win ? pageviewsInWindow(win.start, win.end) : 0;

    // Store performance only. Audience and channel numbers live in Marketing.
    $('admAnStats').innerHTML = [
      statTile('Revenue', aud(curRev.usd), usd(curRev.usd) + ' USD', pctDelta(curRev.usd, prevRev.usd)),
      statTile('Robux revenue', robuxRaw(curRev.robux), null, pctDelta(curRev.robux, prevRev.robux)),
      statTile('Order count', curOrders.length, null, pctDelta(curOrders.length, prevOrders.length)),
      statTile('Avg order value', usd(aov), null, ''),
      statTile('Conversion rate', pct(conv), null, ''),
      statTile('Site visits', curVisits.toLocaleString('en-US'), null, pctDelta(curVisits, prevVisits))
    ].join('');

    $('admRevChart').innerHTML = svgBars(dailyRevenueSeries());
    attachChartTooltip($('admRevChart'));



    var best = bestSellers(6);
    $('admBestSellers').innerHTML = best.length ? best.map(function (p, i) {
      return '<div class="dash-row"><span class="adm-rank">#' + (i + 1) + '</span><span class="dr-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
        '<div class="dr-main"><div class="dr-title">' + esc(p.title) + '</div><div class="dr-sub">' + p.units + ' sold</div></div>' +
        '<span class="p-price">' + usd(p.revenue) + '</span></div>';
    }).join('') : '<p class="adm-empty">No completed orders in this range.</p>';

    var byCat = revenueByCategory();
    $('admCatChart').innerHTML = byCat.length ? svgBars(byCat.map(function (c) { return { label: c.label, v: c.v, tip: usd(c.v) }; }), { height: 120 }) : '<p class="adm-empty">No data.</p>';
    attachChartTooltip($('admCatChart'));
    $('admCatList').innerHTML = byCat.map(function (c) {
      return '<div class="adm-catrow"><span>' + esc(c.label) + '</span><span>' + usd(c.v) + '</span></div>';
    }).join('');

    $('admTrafficChart').innerHTML = svgBars(trafficSeries(), { color: 'var(--price)' });
    attachChartTooltip($('admTrafficChart'));
    var trafficRows = TRAFFIC.slice(Math.max(0, TRAFFIC.length - (RANGE_DAYS || 120)));
    var totalViews = trafficRows.reduce(function (s, r) { return s + r.pageviews; }, 0);
    var totalSessions = trafficRows.reduce(function (s, r) { return s + r.sessions; }, 0);
    $('admTrafficStats').innerHTML =
      '<div class="dash-stat glass"><span class="ds-label">Pageviews</span><span class="ds-num">' + totalViews.toLocaleString('en-US') + '</span></div>' +
      '<div class="dash-stat glass"><span class="ds-label">Sessions</span><span class="ds-num">' + totalSessions.toLocaleString('en-US') + '</span></div>';

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
  var PROD_STATUS_FILTER = 'all';
  var prodStatusFilterEl = $('admProdStatusFilter');
  if (prodStatusFilterEl) prodStatusFilterEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-prod-status-btn'); if (!btn) return;
    PROD_STATUS_FILTER = btn.getAttribute('data-status');
    prodStatusFilterEl.querySelectorAll('.adm-prod-status-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    renderProducts();
  });
  function renderProducts() {
    var q = ($('admProdSearch') || {}).value || '';
    q = q.trim().toLowerCase();
    var unreleasedCount = allProducts().filter(function (p) { return !p.visible; }).length;
    var countEl = $('admProdUnreleasedCount'); if (countEl) countEl.textContent = unreleasedCount ? '(' + unreleasedCount + ')' : '';
    var rows = sortProducts(allProducts().filter(function (p) {
      if (!(!q || p.title.toLowerCase().indexOf(q) >= 0)) return false;
      if (PROD_STATUS_FILTER === 'released') return p.visible;
      if (PROD_STATUS_FILTER === 'unreleased') return !p.visible;
      return true;
    }));
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
      var dlBtn = e.target.closest('.adm-prod-download');
      dlBtn.disabled = true;
      invokeAdminFn('admin-get-download-url', { productId: p.dbId }, 'Could not download the product file.').then(function (d) {
        dlBtn.disabled = false;
        window.open(d.url, '_blank', 'noopener');
      }).catch(function (err) {
        dlBtn.disabled = false;
        alert(err.message || 'Could not download the product file.');
      });
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

  // The placeholder is the products table's column default, so a product that
  // has never had a real upload still reads as having a file. Say so plainly
  // rather than leaving the admin to guess.
  var PLACEHOLDER_PATH = '_shared/placeholder.zip';
  function setFileNote(el, storagePath, pendingName) {
    if (!el) return;
    el.removeAttribute('href');
    if (pendingName) {
      el.textContent = 'Selected: ' + pendingName + ' (uploaded, saves with the product)';
      el.classList.remove('adm-note-warn');
      return;
    }
    if (!storagePath || storagePath === PLACEHOLDER_PATH) {
      el.textContent = 'No file attached - buyers would download the placeholder.';
      el.classList.add('adm-note-warn');
      return;
    }
    // Strip the 8-char storage prefix so this matches the filename the buyer
    // actually receives (see _shared/download.ts downloadName).
    el.textContent = 'Attached: ' + storagePath.split('/').pop().replace(/^[0-9a-f]{8}-/i, '');
    el.classList.remove('adm-note-warn');
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
    updateDevexHint();
  }
  function updateDevexHint() {
    var hint = $('admEditDevexHint'); if (!hint) return;
    var platform = ($('admEditPlatform') || {}).value;
    var usdPrice = parseFloat($('admEditPrice').value) || 0;
    // Matches renderGamepassStatus()'s gate - Robux/DevEx pricing only
    // applies to Roblox products, so Minecraft products shouldn't show a
    // nonsensical Robux conversion hint.
    hint.textContent = (platform === 'Roblox' && usdPrice > 0)
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
    // This used to read tech.fileName - a free-text field the admin types for
    // display on the product page - so it happily said "Selected: kit.zip"
    // while storage_path was still the column default and buyers were
    // downloading the placeholder. Report the actual attached object.
    setFileNote(fileNote, p.storagePath);
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
      setFileNote(fileNote, null, f.name);
    }).catch(function (err) {
      pendingStoragePath = null;
      fileNote.textContent = 'Upload failed: ' + (err.message || 'try again') + '.';
      fileNote.classList.add('adm-note-warn');
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
    setFileNote($('admEditFileNote'), null);

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
      // Create used to omit this, so a file uploaded while filling in a new
      // product was written to Storage and then thrown away: the row kept the
      // column default, _shared/placeholder.zip, and buyers downloaded the
      // placeholder. openProductEdit() runs straight after this and clears
      // pendingStoragePath, so there was no second chance to save it either.
      if (pendingStoragePath) fields.storagePath = pendingStoragePath;
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
    { value: 'refunded', label: 'Refunded' }
  ], 'all');
  function renderOrders() {
    var statusF = orderStatusDropdown.getValue() || 'all';
    var q = (($('admOrderSearch') || {}).value || '').trim().toLowerCase();
    var rows = ORDERS.filter(function (o) {
      if (o.status === 'pending' || o.status === 'failed') return false;
      var okStatus = statusF === 'all' || o.status === statusF;
      var okQ = !q || o.id.toLowerCase().indexOf(q) >= 0 || o.title.toLowerCase().indexOf(q) >= 0 || o.userName.toLowerCase().indexOf(q) >= 0;
      return okStatus && okQ;
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 200);
    $('admOrdersBody').innerHTML = rows.map(function (o) {
      var actions = '';
      if (o.status === 'completed' && can('support')) actions += '<button class="btn btn-ghost adm-btn-sm adm-order-refund" type="button">Refund</button>';
      return '<tr data-id="' + esc(o.id) + '">' +
        '<td>' + fmtDate(new Date(o.date)) + '</td>' +
        '<td class="dt-mono">' + esc(o.id) + '</td>' +
        '<td>' + esc(o.title) + (o.licence === 'resell' ? ' <span class="adm-sub">· resell</span>' : '') + '</td>' +
        '<td>' + esc(o.userName) + '</td>' +
        '<td>' + o.currency.toUpperCase() + '</td>' +
        '<td>' + orderAmount(o) + '</td>' +
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
        logAudit('Refunded order ' + id + ' (' + orderAmount(o) + ')');
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
      return '<tr><td>' + fmtDate(new Date(o.date)) + '</td><td class="dt-mono">' + esc(o.id) + '</td><td>' + esc(o.title) + '</td><td>' + esc(o.userName) + '</td><td>' + orderAmount(o) + '</td><td>' + esc(o.refundReason || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="adm-empty">No refunds yet.</td></tr>';

    var pending = ORDERS.filter(function (o) { return o.status === 'completed'; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 30);
    $('admRefundEligible').innerHTML = pending.map(function (o) {
      return '<tr data-id="' + esc(o.id) + '"><td>' + fmtDate(new Date(o.date)) + '</td><td class="dt-mono">' + esc(o.id) + '</td><td>' + esc(o.title) + '</td><td>' + esc(o.userName) + '</td><td>' + orderAmount(o) + '</td>' +
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
      callModerateReview(r.dbId, 'approve').then(function () {
        logAudit('Approved review by ' + r.user + ' on "' + r.productTitle + '"');
        return refreshReviews();
      }).catch(function (err) { alert(err.message || 'Could not approve review.'); });
    } else if (e.target.classList.contains('adm-rev-hide')) {
      callModerateReview(r.dbId, 'hide').then(function () {
        logAudit('Hid review by ' + r.user + ' on "' + r.productTitle + '"');
        return refreshReviews();
      }).catch(function (err) { alert(err.message || 'Could not hide review.'); });
    } else if (e.target.classList.contains('adm-rev-reply-toggle')) {
      var form = card.querySelector('.adm-review-reply-form');
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('textarea').focus();
    } else if (e.target.classList.contains('adm-rev-reply-save')) {
      var text = card.querySelector('.adm-rev-reply-input').value.trim();
      callModerateReview(r.dbId, 'reply', text || null).then(function () {
        logAudit((text ? 'Replied to' : 'Removed reply on') + ' review by ' + r.user + ' on "' + r.productTitle + '"');
        return refreshReviews();
      }).catch(function (err) { alert(err.message || 'Could not save reply.'); });
    } else if (e.target.classList.contains('adm-rev-goto')) {
      openProductEdit(r.productId);
    }
  });

  /* ---- Import a review (from another platform) ---- */
  var importReviewSearch = $('admImportReviewProductSearch');
  var importReviewResults = $('admImportReviewProductResults');
  var importReviewSlugInput = $('admImportReviewProductSlug');
  if (importReviewSearch) importReviewSearch.addEventListener('input', function () {
    importReviewSlugInput.value = '';
    var q = importReviewSearch.value.trim().toLowerCase();
    if (!q) { importReviewResults.hidden = true; return; }
    var matches = PRODUCTS_CACHE.filter(function (p) { return p.title.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    importReviewResults.innerHTML = matches.map(function (p) {
      return '<button type="button" class="adm-dd-opt" data-slug="' + esc(p.id) + '" data-title="' + esc(p.title) + '">' + esc(p.title) + '</button>';
    }).join('') || '<div class="adm-dd-opt" style="opacity:.5;">No matches</div>';
    importReviewResults.hidden = false;
  });
  if (importReviewResults) importReviewResults.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-slug]'); if (!opt) return;
    importReviewSlugInput.value = opt.getAttribute('data-slug');
    importReviewSearch.value = opt.getAttribute('data-title');
    importReviewResults.hidden = true;
  });
  document.addEventListener('click', function (e) {
    if (importReviewResults && !e.target.closest('#admImportReviewProductSearch') && !e.target.closest('#admImportReviewProductResults')) {
      importReviewResults.hidden = true;
    }
  });
  var importReviewForm = $('admImportReviewForm');
  if (importReviewForm) importReviewForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var msgEl = $('admImportReviewMsg');
    var slug = importReviewSlugInput.value;
    if (!slug) { if (msgEl) { msgEl.className = 'co-msg err show'; msgEl.textContent = 'Pick a product from the search results.'; } return; }
    var body = {
      slug: slug,
      stars: $('admImportReviewStars').value,
      reviewerName: $('admImportReviewName').value.trim(),
      platform: $('admImportReviewPlatform').value,
      text: $('admImportReviewText').value.trim()
    };
    invokeAdminFn('admin-import-review', body, 'Could not import review.').then(function () {
      logAudit('Imported a ' + body.platform + ' review for "' + importReviewSearch.value + '"');
      importReviewForm.reset(); importReviewSlugInput.value = '';
      if (msgEl) { msgEl.className = 'co-msg show'; msgEl.textContent = 'Review imported and published.'; }
      return refreshReviews();
    }).catch(function (err) {
      if (msgEl) { msgEl.className = 'co-msg err show'; msgEl.textContent = err.message || 'Could not import review.'; }
    });
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
      return '<tr data-id="' + u.id + '"><td>' + esc(u.name) + (u.isAdmin ? ' <span class="adm-sub">· admin</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + fmtDate(new Date(u.joined)) + '</td><td>' + userOrderCount(u.id) + '</td><td>' + usd(userSpend(u.id)) + '</td>' +
        '<td>' + (u.status === 'active' ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Banned' + (u.banReason ? ' — ' + esc(u.banReason) : '') + '</span>') + '</td>' +
        '<td class="adm-row-actions">' +
          (can('admin') && !u.isAdmin ? '<button class="btn btn-ghost adm-btn-sm adm-user-ban" type="button">' + (u.status === 'active' ? 'Ban' : 'Unban') + '</button>' : '') +
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
    var willBan = u.status === 'active';
    var reason = null;
    if (willBan) {
      reason = prompt('Reason for banning ' + u.name + ':', 'Violated terms of service');
      if (reason === null) return;
    } else if (!confirm('Unban ' + u.name + '?')) return;
    var btn = e.target;
    btn.disabled = true;
    invokeAdminFn('admin-set-user-banned', { userId: u.id, banned: willBan, reason: reason }, 'Could not update user.').then(function () {
      logAudit((willBan ? 'Banned' : 'Unbanned') + ' user ' + u.name);
      return refreshUsers();
    }).catch(function (err) {
      btn.disabled = false;
      alert(err.message || 'Could not update user.');
    });
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
    var msg = $('admGrantMsg');
    var submitBtn = grantForm.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    invokeAdminFn('admin-grant-product', { userId: u.id, productId: p.dbId }, 'Could not grant the product.').then(function () {
      logAudit('Manually granted "' + p.title + '" to ' + u.name);
      if (msg) { msg.textContent = 'Granted "' + p.title + '" to ' + u.name + '.'; setTimeout(function () { msg.textContent = ''; }, 3000); }
      if (submitBtn) submitBtn.disabled = false;
      return refreshOrders();
    }).catch(function (err) {
      if (submitBtn) submitBtn.disabled = false;
      if (msg) msg.textContent = err.message || 'Could not grant the product.';
    });
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
  function productsInScope(scopeInfo) {
    return PRODUCTS_CACHE.filter(function (p) {
      if (scopeInfo.scope === 'platform') return p.platform === scopeInfo.platform;
      if (scopeInfo.scope === 'category') return p.platform === scopeInfo.platform && p.cat === scopeInfo.category;
      return true; // sitewide
    });
  }
  // Checked against product_legal (min_sale_usd / disallow_sales) before a
  // sale event or coupon can be saved, so a broad-scope discount can never
  // silently undercut a product's contractual minimum price or discount
  // one explicitly marked as not-for-sale.
  function legalViolations(scopeInfo, discountedPriceFor) {
    var disallowed = [], belowMin = [], notFreeable = [];
    productsInScope(scopeInfo).forEach(function (p) {
      var legal = p.legal || {};
      if (legal.disallowSales) { disallowed.push(p.title); return; }
      var discounted = discountedPriceFor(p.priceNum);
      if (discounted <= 0 && !legal.canBeFree) { notFreeable.push(p.title); return; }
      if (legal.minSaleUsd != null && discounted < Number(legal.minSaleUsd)) belowMin.push(p.title + ' (min $' + Number(legal.minSaleUsd).toFixed(2) + ')');
    });
    return { disallowed: disallowed, belowMin: belowMin, notFreeable: notFreeable, ok: !disallowed.length && !belowMin.length && !notFreeable.length };
  }
  function legalViolationMessage(v) {
    var parts = [];
    if (v.disallowed.length) parts.push(v.disallowed.length + ' product(s) marked "do not discount": ' + v.disallowed.slice(0, 5).join(', ') + (v.disallowed.length > 5 ? '…' : ''));
    if (v.notFreeable.length) parts.push(v.notFreeable.length + ' product(s) would be discounted to $0 but aren\'t allowed to be free: ' + v.notFreeable.slice(0, 5).join(', ') + (v.notFreeable.length > 5 ? '…' : ''));
    if (v.belowMin.length) parts.push(v.belowMin.length + ' product(s) would fall below their minimum sale price: ' + v.belowMin.slice(0, 5).join(', ') + (v.belowMin.length > 5 ? '…' : ''));
    return 'Can\'t save - ' + parts.join('; ') + '.';
  }

  var salesTypeToggle = $('admSalesTypeToggle');
  if (salesTypeToggle) salesTypeToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-sales-type-btn'); if (!btn) return;
    var type = btn.getAttribute('data-type');
    salesTypeToggle.querySelectorAll('.adm-sales-type-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $('admSalesEventsView').hidden = type !== 'events';
    $('admDiscountCodesView').hidden = type !== 'codes';
  });

  var contentTypeToggle = $('admContentTypeToggle');
  if (contentTypeToggle) contentTypeToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-content-type-btn'); if (!btn) return;
    var type = btn.getAttribute('data-type');
    contentTypeToggle.querySelectorAll('.adm-content-type-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $('admContentPostsView').hidden = type !== 'posts';
    $('admContentTutorialsView').hidden = type !== 'tutorials';
    $('admContentReleasesView').hidden = type !== 'releases';
  });

  var siteMgmtToggle = $('admSiteMgmtToggle');
  if (siteMgmtToggle) siteMgmtToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-sitemgmt-btn'); if (!btn) return;
    var view = btn.getAttribute('data-view');
    siteMgmtToggle.querySelectorAll('.adm-sitemgmt-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $('admSiteMgmtAccessView').hidden = view !== 'access';
    $('admSiteMgmtRobloxView').hidden = view !== 'roblox';
    $('admSiteMgmtStaffView').hidden = view !== 'staff';
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
      var newActive = !ev.active;
      var evData = Object.assign({}, ev); delete evData.id; delete evData.slug; delete evData.active;
      callUpsertContent('sale_event', ev.id, ev.slug, newActive, evData)
        .then(function () { logAudit((newActive ? 'Activated' : 'Deactivated') + ' sale event "' + ev.title + '"'); return refreshSaleEvents(); })
        .catch(function (err) { alert(err.message || 'Could not update sale event.'); });
    } else if (e.target.classList.contains('adm-event-del')) {
      if (!confirm('Delete sale event "' + ev.title + '"? This can\'t be undone.')) return;
      callDeleteContent(ev.id)
        .then(function () {
          logAudit('Deleted sale event "' + ev.title + '"');
          if ($('admEventEditId').value === id) resetEventForm();
          return refreshSaleEvents();
        })
        .catch(function (err) { alert(err.message || 'Could not delete sale event.'); });
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
    var pctOff = fields.percentOff;
    var violations = legalViolations(scopeInfo, function (price) { return price * (1 - pctOff / 100); });
    if (!violations.ok) { alert(legalViolationMessage(violations)); return; }
    var existing = id ? SALE_EVENTS.filter(function (x) { return x.id === id; })[0] : null;
    var active = existing ? existing.active : true;
    var slug = existing ? existing.slug : (fields.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sale') + '-' + Date.now().toString(36);
    callUpsertContent('sale_event', id || null, slug, active, fields)
      .then(function () {
        logAudit((existing ? 'Updated' : 'Created') + ' sale event "' + fields.title + '"');
        resetEventForm();
        return refreshSaleEvents();
      })
      .catch(function (err) { alert(err.message || 'Could not save sale event.'); });
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
    var couponViolations = legalViolations(scopeInfo, function (price) {
      return type === 'flat' ? Math.max(0, price - val) : price * (1 - val / 100);
    });
    if (!couponViolations.ok) { alert(legalViolationMessage(couponViolations)); return; }
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
      if (curPanel === 'sitemgmt') renderRobloxContainers();
      if (curPanel === 'home') renderHome();
    });
  }
  // Phase D fallback health - table may not exist yet if
  // roblox_cookie_health.sql hasn't been run, so a failed select here is
  // expected/harmless until then.
  var ROBLOX_COOKIE_BROKEN = false;
  function refreshRobloxCookieHealth() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('roblox_cookie_health').select('*').eq('id', true).maybeSingle().then(function (res) {
      ROBLOX_COOKIE_BROKEN = !!(res.data && !res.error && !res.data.ok);
      var el = $('admRobloxCookieWarning');
      if (el) {
        if (res.error || !res.data || res.data.ok) { el.hidden = true; }
        else { el.hidden = false; el.textContent = 'Robux fallback cookie is broken (' + (res.data.last_error || 'unknown error') + ') - refresh it, then update the ROBLOX_FALLBACK_COOKIE secret.'; }
      }
      if (curPanel === 'home') renderHome();
    });
  }
  /* ================================================================
     ROBUX POOL PANEL (shared leased-gamepass pool checkout draws from)
     ================================================================ */
  function refreshRobloxPool() {
    var body = $('admRobloxPoolBody'); if (!body) return Promise.resolve();
    return invokeAdminFn('admin-robux-pool', { action: 'stats' }, 'Could not load the pool.').then(function (data) {
      renderRobloxPool(data.stats, data.passes || []);
    }).catch(function (err) {
      var msg = $('admRobloxPoolMsg'); if (msg) msg.textContent = err.message;
    });
  }
  function renderRobloxPool(stats, passes) {
    stats = stats || { total: 0, free_now: 0, leased_now: 0 };
    var t = $('admRoboxPoolTotal'), f = $('admRoboxPoolFree'), l = $('admRoboxPoolLeased');
    if (t) t.textContent = stats.total;
    if (f) f.textContent = stats.free_now;
    if (l) l.textContent = stats.leased_now;
    var body = $('admRobloxPoolBody'); if (!body) return;
    if (!passes.length) { body.innerHTML = '<tr><td colspan="5" class="adm-empty">No pool passes yet - seed some to start.</td></tr>'; return; }
    body.innerHTML = passes.map(function (p) {
      var leased = p.leased_order_id && p.lease_expires_at && new Date(p.lease_expires_at).getTime() > Date.now();
      var state = !p.active ? 'Disabled' : (leased ? 'Leased' : 'Free');
      return '<tr>' +
        '<td>' + esc(p.gamepass_id) + '</td>' +
        '<td>' + esc(p.universe_id) + '</td>' +
        '<td><span class="dt-badge ' + (state === 'Free' ? 'ok' : (state === 'Leased' ? 'warn' : 'err')) + '">' + state + '</span></td>' +
        '<td>' + (leased && p.lease_price_robux != null ? esc(p.lease_price_robux) + ' R$' : '–') + '</td>' +
        '<td>' + (leased ? new Date(p.lease_expires_at).toLocaleString() : '–') + '</td>' +
        '</tr>';
    }).join('');
  }
  var robloxPoolSeedForm = $('admRobloxPoolSeedForm');
  if (robloxPoolSeedForm) robloxPoolSeedForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var count = Math.max(1, Math.min(10, parseInt($('admRobloxPoolSeedCount').value, 10) || 5));
    var btn = $('admRobloxPoolSeedBtn'), msg = $('admRobloxPoolMsg');
    btn.disabled = true;
    if (msg) msg.textContent = 'Creating gamepasses on Roblox…';
    invokeAdminFn('admin-robux-pool', { action: 'seed', count: count }, 'Could not seed the pool.').then(function (data) {
      if (msg) msg.textContent = 'Created ' + data.created + ' of ' + count + ' requested pass' + (count === 1 ? '' : 'es') + (data.errors && data.errors.length ? ' - ' + data.errors[0] : '.');
      logAudit('Seeded ' + data.created + ' Robux pool pass(es)');
      return refreshRobloxPool();
    }).catch(function (err) {
      if (msg) msg.textContent = err.message;
    }).then(function () {
      btn.disabled = false;
    });
  });

  /* ================================================================
     SITE ACCESS PANEL (open / maintenance / locked)
     ================================================================ */
  var siteMode = 'open';
  function refreshSiteStatus() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('site_status').select('*').eq('id', true).maybeSingle().then(function (res) {
      var data = res && res.data;
      siteMode = (data && data.mode) || 'open';
      var cur = $('admSiteCurrentStatus');
      if (cur) cur.textContent = siteMode.charAt(0).toUpperCase() + siteMode.slice(1);
      document.querySelectorAll('.adm-site-mode-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-mode') === siteMode);
      });
      var maintFields = $('admSiteMaintFields'), lockedHint = $('admSiteLockedHint');
      if (maintFields) maintFields.hidden = siteMode !== 'maintenance';
      if (lockedHint) lockedHint.hidden = siteMode !== 'locked';
      if (data) {
        var msgEl = $('admSiteMaintMsg'); if (msgEl) msgEl.value = data.maintenance_message || '';
        var endsEl = $('admSiteMaintEnds');
        if (endsEl) endsEl.value = data.maintenance_ends_at ? new Date(data.maintenance_ends_at).toISOString().slice(0, 16) : '';
      }
    });
  }
  document.querySelectorAll('.adm-site-mode-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      siteMode = b.getAttribute('data-mode');
      document.querySelectorAll('.adm-site-mode-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      var maintFields = $('admSiteMaintFields'), lockedHint = $('admSiteLockedHint');
      if (maintFields) maintFields.hidden = siteMode !== 'maintenance';
      if (lockedHint) lockedHint.hidden = siteMode !== 'locked';
    });
  });
  var admSiteSaveBtn = $('admSiteSaveBtn');
  if (admSiteSaveBtn) admSiteSaveBtn.addEventListener('click', function () {
    if (!can('owner')) { alert('Only the owner can change site access.'); return; }
    var msg = $('admSiteMaintMsg'), ends = $('admSiteMaintEnds');
    var payload = {
      mode: siteMode,
      message: msg ? msg.value.trim() : '',
      endsAt: ends && ends.value ? new Date(ends.value).toISOString() : null
    };
    if (siteMode === 'locked' && !confirm('Lock the entire site? Nobody - including admins - will be able to get in without the shared lock.html password until you unlock it.')) return;
    admSiteSaveBtn.disabled = true;
    invokeAdminFn('admin-set-site-status', payload, 'Could not update site status.').then(function () {
      logAudit('Set site access to ' + siteMode);
      return refreshSiteStatus();
    }).catch(function (err) {
      var m = $('admSiteMsg'); if (m) m.textContent = err.message || 'Could not save.';
    }).then(function () {
      admSiteSaveBtn.disabled = false;
    });
  });

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

  // Shared by the Posts and Tutorials forms - read/tutorial time is
  // computed from the body's word count (200 wpm) instead of typed in by
  // hand, so it can't drift out of sync with the actual content.
  function estimateReadMins(text) {
    var words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }
  var postBodyInput = $('admNewPostBody');
  if (postBodyInput) postBodyInput.addEventListener('input', function () { $('admNewPostRead').value = estimateReadMins(postBodyInput.value); });
  var tutBodyInput = $('admNewTutBody');
  if (tutBodyInput) tutBodyInput.addEventListener('input', function () { $('admNewTutMins').value = estimateReadMins(tutBodyInput.value); });

  /* ================================================================
     BLOG POSTS PANEL
     ================================================================ */
  var POSTS = [];
  function mapContentRow(row) { return Object.assign({ id: row.id, slug: row.slug, visible: row.visible }, row.data || {}); }
  function refreshPosts() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('content').select('*').eq('type', 'post').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error('[admin] failed to load posts:', res.error.message); return; }
      POSTS = (res.data || []).map(mapContentRow);
      if (curPanel === 'content') renderPosts();
    });
  }
  function callUpsertContent(type, id, slug, visible, data) {
    return invokeAdminFn('admin-upsert-content', { id: id || null, type: type, slug: slug, visible: visible, data: data }, 'Could not save.');
  }
  function callDeleteContent(id) {
    return invokeAdminFn('admin-delete-content', { id: id }, 'Could not delete.');
  }
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
    $('admNewPostCover').value = p.cover;
    $('admNewPostDek').value = p.dek;
    $('admNewPostBody').value = p.body;
    $('admNewPostRead').value = estimateReadMins(p.body);
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
      var newVisible = !p.visible;
      var postData = Object.assign({}, p); delete postData.id; delete postData.slug; delete postData.visible;
      callUpsertContent('post', p.id, p.slug, newVisible, postData)
        .then(function () { logAudit((newVisible ? 'Published' : 'Unpublished') + ' post "' + p.title + '"'); return refreshPosts(); })
        .catch(function (err) { alert(err.message || 'Could not update post.'); });
    } else if (e.target.classList.contains('adm-post-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + p.title + '"? This can\'t be undone.')) return;
      callDeleteContent(p.id)
        .then(function () { logAudit('Deleted post "' + p.title + '"'); return refreshPosts(); })
        .catch(function (err) { alert(err.message || 'Could not delete post.'); });
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
    var existing = editId ? POSTS.filter(function (x) { return x.id === editId; })[0] : null;
    var visible = $('admNewPostPublished').checked;
    var data = {
      title: title,
      category: $('admNewPostCategory').value,
      author: $('admNewPostAuthor').value.trim() || 'coldd',
      date: $('admNewPostDate').value,
      readMins: estimateReadMins($('admNewPostBody').value),
      cover: $('admNewPostCover').value.trim() || '/banner.jpg',
      dek: $('admNewPostDek').value.trim(),
      body: $('admNewPostBody').value,
      tags: existing ? existing.tags : [],
      featured: existing ? existing.featured : false
    };
    var slug = existing ? existing.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    callUpsertContent('post', editId || null, slug, visible, data)
      .then(function () {
        logAudit((existing ? 'Edited' : 'Added') + ' post "' + title + '"');
        resetPostForm();
        return refreshPosts();
      })
      .catch(function (err) { alert(err.message || 'Could not save post.'); });
  });

  /* ================================================================
     TUTORIALS PANEL
     ================================================================ */
  var TUTORIALS = [];
  function refreshTutorials() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('content').select('*').eq('type', 'tutorial').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error('[admin] failed to load tutorials:', res.error.message); return; }
      TUTORIALS = (res.data || []).map(mapContentRow);
      if (curPanel === 'content') renderTutorials();
    });
  }
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
    $('admNewTutCover').value = t.cover;
    $('admNewTutVideo').value = t.video || '';
    $('admNewTutSummary').value = t.summary;
    $('admNewTutBody').value = t.body;
    $('admNewTutMins').value = estimateReadMins(t.body);
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
      var newVisible = !t.visible;
      var tutData = Object.assign({}, t); delete tutData.id; delete tutData.slug; delete tutData.visible;
      callUpsertContent('tutorial', t.id, t.slug, newVisible, tutData)
        .then(function () { logAudit((newVisible ? 'Published' : 'Unpublished') + ' tutorial "' + t.title + '"'); return refreshTutorials(); })
        .catch(function (err) { alert(err.message || 'Could not update tutorial.'); });
    } else if (e.target.classList.contains('adm-tut-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + t.title + '"? This can\'t be undone.')) return;
      callDeleteContent(t.id)
        .then(function () { logAudit('Deleted tutorial "' + t.title + '"'); return refreshTutorials(); })
        .catch(function (err) { alert(err.message || 'Could not delete tutorial.'); });
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
    var existing = editId ? TUTORIALS.filter(function (x) { return x.id === editId; })[0] : null;
    var visible = $('admNewTutPublished').checked;
    var data = {
      title: title,
      track: $('admNewTutTrack').value,
      difficulty: $('admNewTutDifficulty').value,
      platform: $('admNewTutPlatform').value,
      order: parseInt($('admNewTutOrder').value, 10) || 1,
      estMins: estimateReadMins($('admNewTutBody').value),
      cover: $('admNewTutCover').value.trim() || '/scripts.jpg',
      video: $('admNewTutVideo').value.trim(),
      summary: $('admNewTutSummary').value.trim(),
      body: $('admNewTutBody').value
    };
    var slug = existing ? existing.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    callUpsertContent('tutorial', editId || null, slug, visible, data)
      .then(function () {
        logAudit((existing ? 'Edited' : 'Added') + ' tutorial "' + title + '"');
        resetTutForm();
        return refreshTutorials();
      })
      .catch(function (err) { alert(err.message || 'Could not save tutorial.'); });
  });

  /* ================================================================
     RELEASES PANEL
     ================================================================ */
  var RELEASES = [];
  function refreshReleases() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('content').select('*').eq('type', 'release').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error('[admin] failed to load releases:', res.error.message); return; }
      RELEASES = (res.data || []).map(mapContentRow);
      if (curPanel === 'content') renderReleases();
    });
  }
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
      var newVisible = !r.visible;
      var relData = Object.assign({}, r); delete relData.id; delete relData.slug; delete relData.visible;
      callUpsertContent('release', r.id, r.slug, newVisible, relData)
        .then(function () { logAudit((newVisible ? 'Published' : 'Unpublished') + ' release "' + r.title + '"'); return refreshReleases(); })
        .catch(function (err) { alert(err.message || 'Could not update release.'); });
    } else if (e.target.classList.contains('adm-rel-del')) {
      if (!can('admin')) return;
      if (!confirm('Delete "' + r.title + '"? This can\'t be undone.')) return;
      callDeleteContent(r.id)
        .then(function () { logAudit('Deleted release "' + r.title + '"'); return refreshReleases(); })
        .catch(function (err) { alert(err.message || 'Could not delete release.'); });
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
    var existing = editId ? RELEASES.filter(function (x) { return x.id === editId; })[0] : null;
    var visible = $('admNewRelPublished').checked;
    var data = {
      version: $('admNewRelVersion').value.trim(),
      kind: $('admNewRelKind').value,
      title: title,
      date: $('admNewRelDate').value,
      affects: $('admNewRelAffects').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      summary: $('admNewRelSummary').value.trim(),
      details: ''
    };
    var slug = existing ? existing.slug : (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'release') + '-' + Date.now().toString(36);
    callUpsertContent('release', editId || null, slug, visible, data)
      .then(function () {
        logAudit((existing ? 'Edited' : 'Added') + ' release "' + title + '"');
        resetRelForm();
        return refreshReleases();
      })
      .catch(function (err) { alert(err.message || 'Could not save release.'); });
  });

  /* ================================================================
     STAFF PANEL - real, backed by profiles.is_admin/role. All writes go
     through admin-set-staff-role (service role, requires the CALLER to
     be an owner, refuses self-changes).
     ================================================================ */
  var ADM_DD_CHEV = '<svg class="adm-dd-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function callSetStaffRole(email, role) {
    return invokeAdminFn('admin-set-staff-role', { email: email, role: role }, 'Could not update staff access.');
  }
  function renderStaff() {
    $('admStaffBody').innerHTML = STAFF.map(function (s) {
      var isSelf = s.id === (window.__ADMIN_ID || null);
      var editable = can('owner') && !isSelf;
      var roleMenu = ['owner', 'admin', 'support'].map(function (r) {
        return '<button type="button" class="adm-dd-opt' + (r === s.role ? ' active' : '') + '" data-value="' + r + '" role="option" aria-selected="' + (r === s.role ? 'true' : 'false') + '"><span>' + r + '</span><span class="adm-dd-radio"></span></button>';
      }).join('');
      return '<tr data-id="' + s.id + '" data-email="' + esc(s.email || '') + '"><td>' + esc(s.name) + (isSelf ? ' <span class="adm-sub">(you)</span>' : '') + '</td><td class="dt-mono">' + esc(s.email || '—') + '</td>' +
        '<td><div class="adm-dd adm-dd-inline adm-staff-role-dd"' + (editable ? '' : ' data-disabled="1"') + '>' +
          '<button type="button" class="adm-dd-btn"' + (editable ? '' : ' disabled') + ' aria-haspopup="listbox" aria-expanded="false"><span class="adm-dd-val">' + esc(s.role) + '</span>' + ADM_DD_CHEV + '</button>' +
          '<div class="adm-dd-menu" role="listbox" aria-label="Role" hidden>' + roleMenu + '</div>' +
        '</div></td>' +
        '<td class="adm-row-actions">' + (editable ? '<button class="btn btn-ghost adm-btn-sm adm-staff-remove" type="button">Revoke access</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="adm-empty">No staff yet.</td></tr>';
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
      var tr = opt.closest('tr'); var id = tr.getAttribute('data-id'), email = tr.getAttribute('data-email');
      var s = STAFF.filter(function (x) { return x.id === id; })[0]; if (!s || !email) return;
      var newRole = opt.getAttribute('data-value');
      callSetStaffRole(email, newRole)
        .then(function () { logAudit('Changed ' + s.name + '\'s role to ' + newRole); return refreshStaff(); })
        .catch(function (err) { alert(err.message || 'Could not update role.'); });
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
    var tr = e.target.closest('tr'); var id = tr.getAttribute('data-id'), email = tr.getAttribute('data-email');
    var s = STAFF.filter(function (x) { return x.id === id; })[0]; if (!s || !email) return;
    if (!confirm('Revoke ' + s.name + '\'s staff access?')) return;
    callSetStaffRole(email, null)
      .then(function () { logAudit('Revoked staff access for ' + s.name); return refreshStaff(); })
      .catch(function (err) { alert(err.message || 'Could not revoke access.'); });
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
    var email = $('admNewStaffEmail').value.trim();
    var role = $('admNewStaffRole').value;
    var msgEl = $('admStaffMsg');
    if (!email) return;
    callSetStaffRole(email, role).then(function (data) {
      logAudit('Granted ' + (data.username || email) + ' staff access (' + role + ')');
      addStaffForm.reset(); newStaffRoleDropdown.setValue('support', true);
      if (msgEl) { msgEl.className = 'co-msg show'; msgEl.textContent = 'Access granted.'; }
      return refreshStaff();
    }).catch(function (err) {
      if (msgEl) { msgEl.className = 'co-msg err show'; msgEl.textContent = err.message || 'Could not grant access.'; }
    });
  });

  /* ================================================================
     AUDIT LOG PANEL
     ================================================================ */
  var auditQuery = '', auditActor = '';

  // Declared before renderAudit() runs; makeDropdown returns a no-op shim if
  // the element is missing, so this is safe even on a stripped page.
  var auditActorDropdown = makeDropdown($('admAuditActorDD'), {
    valueInput: $('admAuditActor'),
    placeholder: 'All staff',
    onChange: function (v) { auditActor = v || ''; renderAudit(); }
  });
  if ($('admAuditSearch')) {
    $('admAuditSearch').addEventListener('input', function (e) {
      auditQuery = e.target.value.trim();
      renderAudit();
    });
  }

  function renderAudit() {
    var warn = $('admAuditWarn');
    if (warn) {
      warn.hidden = !AUDIT_PERSIST_ERROR;
      if (AUDIT_PERSIST_ERROR) {
        warn.innerHTML = '<strong>This log is not being saved.</strong> Entries below are only in this browser tab and ' +
          'will disappear on reload. The admin_audit_log table is missing or unreadable - run ' +
          '<code>supabase/admin_audit_log.sql</code> in the Supabase SQL editor. ' +
          '<span class="adm-sub">(' + esc(AUDIT_PERSIST_ERROR) + ')</span>';
      }
    }

    var actors = [];
    AUDIT.forEach(function (a) { if (a.actor && actors.indexOf(a.actor) < 0) actors.push(a.actor); });
    actors.sort();
    if (auditActorDropdown) {
      auditActorDropdown.setOptions([{ value: '', label: 'All staff' }].concat(actors.map(function (n) {
        return { value: n, label: n };
      })));
      auditActorDropdown.setValue(auditActor, true);
    }

    var q = auditQuery.toLowerCase();
    var rows = AUDIT.filter(function (a) {
      if (auditActor && a.actor !== auditActor) return false;
      if (q && (a.action || '').toLowerCase().indexOf(q) < 0 && (a.actor || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    if ($('admAuditCount')) {
      $('admAuditCount').textContent = rows.length === AUDIT.length
        ? (AUDIT.length + ' entr' + (AUDIT.length === 1 ? 'y' : 'ies'))
        : (rows.length + ' of ' + AUDIT.length);
    }

    $('admAuditBody').innerHTML = rows.map(function (a) {
      return '<tr><td>' + fmtDateTime(new Date(a.ts)) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td></tr>';
    }).join('') || ('<tr><td colspan="3" class="adm-empty">' +
      (AUDIT.length ? 'No entries match that filter.' : 'No actions logged yet.') + '</td></tr>');
  }

  /* ================================================================
     INIT
     ================================================================ */
  renderTopbar();
  showPanel('home');
  refreshProducts().then(function () {
    return refreshOrders().then(function () { refreshAdminReferrals(); refreshPayouts(); });
  });
  refreshCoupons();
  refreshRobloxContainers();
  refreshUsers();
  refreshReviews();
  refreshPosts();
  refreshTutorials();
  refreshReleases();
  refreshSaleEvents();
  refreshTraffic();
  refreshAbandoned();
  refreshStaff();
  refreshRobloxCookieHealth();
  refreshLiveSessions();
  refreshDiscordStats();
  refreshAdbloxStats();
  refreshEmailStats();
  refreshEmailCampaigns();
  refreshEmailConfigStatus();
  var admAdbloxLoadMoreBtn = $('admAdbloxLoadMore');
  if (admAdbloxLoadMoreBtn) admAdbloxLoadMoreBtn.addEventListener('click', function () {
    admAdbloxLoadMoreBtn.disabled = true;
    loadMoreAdbloxLogs().then(function () {
      admAdbloxLoadMoreBtn.disabled = false;
    });
  });
  setInterval(refreshLiveSessions, 30000);
  } // end boot()
})();
