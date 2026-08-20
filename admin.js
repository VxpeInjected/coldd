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

  // A focused <input type="number"> silently changes value on mouse wheel
  // scroll in every major browser - scroll the page while the cursor
  // happens to be over a still-focused price field (easy to do on a form
  // this long) and the number underneath it changes with no visual cue.
  // That's the most likely way a real robux_price ended up saved as a
  // flat 0 - blurring on wheel lets the page scroll normally without the
  // input eating it.
  document.addEventListener('wheel', function (e) {
    var el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number' && e.target === el) el.blur();
  }, { passive: true });

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
  // AdBlox's /servers and /logs endpoints return timestamps with no
  // timezone designator (e.g. "2026-08-12T14:25:15.268322"), even though
  // the account itself is UTC (confirmed via /stats, which does include an
  // explicit +00:00 on the same kind of field). Per the JS Date spec, a
  // date-time string with no offset parses as LOCAL time, not UTC - so
  // without this, every AdBlox time shown here was off by the browser's
  // UTC offset. Appending Z (only if nothing's there already) fixes the
  // parse without touching fields that already carry a real offset.
  function parseAdbloxUtc(s) {
    return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z');
  }
  function daysAgo(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; }
  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  // .adm-row-menu-list (the ⋮ action menu on order/user rows) is
  // position:absolute inside a table wrapped in .dash-tablewrap, which
  // sets overflow-x:auto - and per the CSS overflow spec, setting only
  // overflow-x to a non-visible value forces the browser to compute
  // overflow-y as auto too, so the wrapper clips vertically as well. Any
  // row past the wrapper's visible height opened a menu that was clipped
  // right where its background should have painted, reading as
  // transparent. Portals the menu to <body> as position:fixed while open,
  // positioned from the trigger button's real screen coordinates, and
  // puts it back exactly where it came from on close - same technique the
  // mobile shop filter sheet already uses for the same class of problem.
  function closeAllRowMenus() {
    document.querySelectorAll('.adm-row-menu.open').forEach(function (m) { m.classList.remove('open'); });
    // NOT m.querySelector('.adm-row-menu-list') per menu - while open, the
    // list has been moved (portaled) to <body> by openRowMenu below, so
    // it's no longer a descendant of its .adm-row-menu wrapper at all.
    // Querying for it as a child silently found nothing, so the
    // hide/restore step below never ran on ANY close attempt once a menu
    // had been portaled even once - only the wrapper's 'open' class (a
    // cosmetic hover-state thing) actually came off. The list itself
    // stayed visible at its fixed screen position forever, which is what
    // "can't click off it, stays stuck open" actually was: every call to
    // this function, from every close path (outside click, action taken,
    // opening a different row), looked like it worked but silently did
    // nothing to the thing actually on screen. Iterating every currently-
    // visible list directly (wherever it now lives) and restoring it via
    // its own __ownerMenu back-reference (set in openRowMenu) instead of
    // trying to find it as a child fixes every one of those paths at once.
    document.querySelectorAll('.adm-row-menu-list').forEach(function (list) {
      if (list.hidden) return;
      list.hidden = true;
      list.removeAttribute('style');
      var owner = list.__ownerMenu;
      if (owner && owner.__rmHome) {
        owner.__rmHome.insertBefore(list, owner.__rmHomeNext);
        owner.__rmHome = null;
        owner.__rmHomeNext = null;
      }
    });
  }
  function openRowMenu(menu) {
    closeAllRowMenus();
    var btn = menu.querySelector('.adm-row-menu-btn');
    var list = menu.querySelector('.adm-row-menu-list');
    if (!btn || !list) return;
    menu.__rmHome = list.parentNode;
    menu.__rmHomeNext = list.nextSibling;
    list.__ownerMenu = menu;
    list.hidden = false;
    document.body.appendChild(list);
    var r = btn.getBoundingClientRect();
    var listW = list.offsetWidth || 180;
    var left = Math.max(8, Math.min(r.right - listW, window.innerWidth - listW - 8));
    var top = Math.min(r.bottom + 6, window.innerHeight - list.offsetHeight - 8);
    // right:auto is required, not decorative - .adm-row-menu-list's own CSS
    // sets right:0 for its normal (non-portaled) absolute position, and this
    // cssText assignment only overrides position/top/left. Left unset, that
    // leftover right:0 stretches the fixed-position box all the way to the
    // viewport's right edge with no explicit width - it becomes enormous
    // (looks like a plain rectangle) and, since it's real and clickable, ANY
    // "outside" click still lands inside .adm-row-menu-list and the
    // click-outside handler's closest() check sees it as an inside click
    // and never closes the menu.
    list.style.cssText = 'position:fixed; z-index:250; top:' + top + 'px; left:' + left + 'px; right:auto;';
    menu.classList.add('open');
  }
  // Every panel's own click listener (orders/users/careers rows) only ever
  // reacts to clicks that land on ITS menu's trigger or items, then returns
  // without touching anything else - there was no handler anywhere that
  // closed an open menu on a genuine click elsewhere on the page, so once
  // opened it stayed open (and, since the list is portaled to <body> while
  // open, kept intercepting clicks) until something else happened to call
  // closeAllRowMenus. One global listener for the actual "outside" case.
  document.addEventListener('click', function (e) {
    if (e.target.closest('.adm-row-menu-btn') || e.target.closest('.adm-row-menu-list')) return;
    closeAllRowMenus();
  });

  // supabase-js's functions.invoke() does NOT put the parsed JSON body
  // into res.data on a non-2xx response - res.data is null and res.error
  // is a generic FunctionsHttpError whose .message is always literally
  // "Edge Function returned a non-2xx status code". The real error body
  // has to be read from res.error.context (the raw Response) instead, or
  // every custom error message from every admin Edge Function call gets
  // silently replaced by that one generic string. This wraps
  // functions.invoke() so every call site gets the real message.
  function logFnError(name, msg, status) {
    if (window.coldAuth && window.coldAuth.logClientError) {
      window.coldAuth.logClientError('edge_function', msg, null, { fnName: name, context: { status: status } });
    }
  }
  function invokeAdminFn(name, body, fallback) {
    return window.coldSupabase.functions.invoke(name, { body: body || {} }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        var parsed = (ctx && typeof ctx.json === 'function') ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
        return parsed.then(function (data) {
          var msg = (data && data.error) || res.error.message || fallback || 'Request failed.';
          logFnError(name, msg, ctx && ctx.status);
          throw new Error(msg);
        });
      }
      if (!res.data || !res.data.ok) {
        var failMsg = (res.data && res.data.error) || fallback || 'Request failed.';
        logFnError(name, failMsg);
        throw new Error(failMsg);
      }
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
      robloxId: row.roblox_id || null,
      role: row.role || (row.is_admin ? 'admin' : 'customer'),
      emailVerified: !!row.email_verified,
      marketingUnsubscribed: !!row.marketing_unsubscribed,
      referralCode: row.referral_code || null,
      referredBy: row.referred_by || null
    };
  }
  function refreshUsers() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(20000).then(function (res) {
      if (res.error) { console.error('[admin] failed to load users:', res.error.message); return; }
      USERS = (res.data || []).map(mapProfileRow);
      if (curPanel === 'sitemgmt') renderUsers();
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
      paidAt: row.paid_at || null,
      userId: row.user_id,
      userName: profile ? (profile.username || profile.email || 'user') : 'guest',
      userEmail: profile ? (profile.email || null) : null,
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
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      paymentProvider: row.payment_provider || null,
      paypalOrderId: row.paypal_order_id || null,
      paypalCaptureId: row.paypal_capture_id || null,
      cryptoProvider: row.crypto_provider || null,
      cryptoChargeId: row.crypto_charge_id || null,
      cryptoPaymentId: row.crypto_payment_id || null,
      externalTransactionId: row.external_transaction_id || null,
      robloxGamepassId: row.roblox_gamepass_id || null,
      robloxBuyerId: row.roblox_buyer_id || null,
      robloxVerificationMethod: row.roblox_verification_method || null,
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
  // session (RLS: reviews_select_admin). Writes (hide/reply/seen) go
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
      adminReviewedAt: row.admin_reviewed_at,
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
  var adbloxRefreshBtn = $('admAdbloxRefresh');
  if (adbloxRefreshBtn) adbloxRefreshBtn.addEventListener('click', function () {
    var label = adbloxRefreshBtn.querySelector('.btn-label'), spinner = adbloxRefreshBtn.querySelector('.btn-spinner');
    adbloxRefreshBtn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
    refreshAdbloxStats().then(function () {
      adbloxRefreshBtn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
    });
  });
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
        return {
          id: row.session_id, date: row.updated_at, title: title, image: first.image || '', value: Number(row.value_usd) || 0, email: row.email || null,
          // Added for the account-detail modal's cart activity section -
          // existing callers only ever read the fields above, so this is
          // purely additive.
          userId: row.user_id || null,
          items: items,
          abandonedStep: row.abandoned_step_sent != null ? row.abandoned_step_sent : null,
          recoveryEmailSentAt: row.abandoned_email_sent_at || null
        };
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
    if (curPanel === 'sitemgmt') renderAudit();
    window.coldSupabase.from('admin_audit_log').insert({
      actor_id: ADMIN.id, actor_name: entry.actor, action: action
    }).then(function (res) {
      if (res.error) {
        console.error('[logAudit] failed to persist:', res.error.message);
        // Silently falling back to the in-memory copy is how this ends up
        // looking like a session-only log: the entries are right there on
        // screen, they just evaporate on reload. Say so instead.
        AUDIT_PERSIST_ERROR = res.error.message || 'unknown error';
        if (curPanel === 'sitemgmt') renderAudit();
      }
    });
  }

  // client_errors rows (see supabase/client_errors.sql) merge into the
  // same feed as staff actions, sorted chronologically together - kind:
  // 'error' distinguishes them for rendering (a code badge instead of a
  // staff name, and a Details button that opens the full report).
  function refreshAuditLog() {
    return Promise.all([
      window.coldSupabase.from('admin_audit_log')
        .select('actor_name, action, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      window.coldSupabase.from('client_errors')
        .select('code, kind, message, stack, fn_name, page_url, user_agent, user_id, context, created_at')
        .order('created_at', { ascending: false })
        .limit(300)
    ]).then(function (results) {
      var auditRes = results[0], errRes = results[1];
      if (auditRes.error) {
        console.error('[refreshAuditLog] failed:', auditRes.error.message);
        AUDIT_PERSIST_ERROR = auditRes.error.message || 'unknown error';
        if (curPanel === 'sitemgmt') renderAudit();
        return;
      }
      AUDIT_PERSIST_ERROR = null;
      var staffRows = (auditRes.data || []).map(function (row) {
        return { ts: row.created_at, actor: row.actor_name, action: row.action, kind: 'staff' };
      });
      var errorRows = errRes.error ? [] : (errRes.data || []).map(function (row) {
        return {
          ts: row.created_at, kind: 'error', errKind: row.kind, code: row.code,
          action: row.message, fnName: row.fn_name, stack: row.stack,
          pageUrl: row.page_url, userAgent: row.user_agent, userId: row.user_id, context: row.context
        };
      });
      AUDIT = staffRows.concat(errorRows).sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
      if (curPanel === 'sitemgmt') renderAudit();
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
      wasPrice: row.was_price != null ? Number(row.was_price) : null,
      priority: !!row.priority,
      featured: !!row.featured,
      featuredOrder: Number(row.featured_order) || 0,
      weeklyDeal: !!row.weekly_deal,
      weeklyDealPct: row.weekly_deal_pct != null ? Number(row.weekly_deal_pct) : null,
      weeklyDealAuto: !!row.weekly_deal_auto,
      weeklyDealExcluded: !!row.weekly_deal_excluded,
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
      wasPrice: p.wasPrice,
      priority: p.priority,
      featured: p.featured,
      featuredOrder: p.featuredOrder,
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
  var PANELS = ['home', 'analytics', 'marketing', 'products', 'unreleased', 'product-edit', 'product-update', 'orders', 'order-detail', 'resellers', 'reseller-edit', 'reviews', 'sales', 'sitemgmt', 'content', 'careers'];
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
    else if (name === 'unreleased') renderUnreleasedFiles();
    else if (name === 'orders') renderOrders();
    else if (name === 'order-detail') renderOrderDetail();
    else if (name === 'resellers') renderResellers();
    else if (name === 'reviews') renderReviews();
    else if (name === 'sales') { renderEvents(); renderCoupons(); }
    else if (name === 'sitemgmt') {
      refreshSiteStatus(); renderRobloxContainers(); refreshRobloxCookieHealth(); refreshRobloxPool();
      renderStaff(); renderUsers(); renderAudit(); refreshAuditLog();
    }
    else if (name === 'content') { renderPosts(); renderTutorials(); renderReleases(); }
    else if (name === 'careers') refreshCareerRoles();
  }
  function renderAll() { renderPanel(curPanel); }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-panel]');
    if (a) { e.preventDefault(); showPanel(a.getAttribute('data-panel')); }
  });

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
    var newReviews = REVIEWS.filter(function (r) { return !r.adminReviewedAt; }).length;
    if (newReviews) todo.push({ text: newReviews + ' new review' + (newReviews > 1 ? 's' : '') + ' to look at', panel: 'reviews', badge: 'warn' });
    var pendingPayouts = PAYOUTS.filter(function (p) { return p.status === 'requested'; }).length;
    if (pendingPayouts) todo.push({ text: pendingPayouts + ' referral payout request' + (pendingPayouts > 1 ? 's' : '') + ' pending', panel: 'analytics', badge: 'warn' });
    if (UNRELEASED_FILES.length) todo.push({ text: 'You have ' + UNRELEASED_FILES.length + ' product' + (UNRELEASED_FILES.length > 1 ? 's' : '') + ' to release', panel: 'unreleased', badge: 'warn' });
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
    var cls = status === 'completed' ? 'ok' : (status === 'refunded' || status === 'revoked') ? 'err' : 'warn';
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
    { key: 'x', name: 'X (Twitter)', note: 'Followers, impressions, post reach.', needs: 'Needs TWITTER_BEARER_TOKEN + TWITTER_USERNAME secrets' },
    { key: 'youtube', name: 'YouTube', note: 'Subscribers, views, watch time.', needs: 'Needs YOUTUBE_API_KEY + YOUTUBE_CHANNEL_ID secrets' },
    { key: 'tiktok', name: 'TikTok', note: 'Followers and video views.', needs: 'Not connected yet - click Connect TikTok to authorize.' }
  ];

  // TIKTOK_CLIENT_KEY is the public half of the OAuth pair (as opposed to
  // TIKTOK_CLIENT_SECRET, which never leaves the server - see
  // tiktok-oauth-exchange). Safe to embed client-side, same as any OAuth
  // app's client ID. Builds the same authorize URL TikTok's own docs show
  // for the Display API; scope covers exactly the two fields
  // admin-tiktok-stats reads (follower_count, likes_count, video_count).
  var TIKTOK_CLIENT_KEY = 'sbawte4ixv4nx3rgkb';
  var TIKTOK_REDIRECT_URI = 'https://coldd.dev/tiktok-callback';
  function tiktokAuthorizeUrl() {
    var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      scope: 'user.info.basic,user.info.stats',
      response_type: 'code',
      redirect_uri: TIKTOK_REDIRECT_URI,
      state: state
    });
    return 'https://www.tiktok.com/v2/auth/authorize/?' + params.toString();
  }

  // Populated by refreshSocialStats(); each admin-*-stats function returns
  // { configured: false } when its secrets aren't set yet, rather than an
  // error, so the channel row can show a real "what's missing" hint
  // instead of a bare "Not connected" badge with no next step.
  var YOUTUBE_STATS = null, X_STATS = null, TIKTOK_STATS = null;
  function refreshSocialStats() {
    return Promise.all([
      invokeAdminFn('admin-youtube-stats', {}).then(function (d) { YOUTUBE_STATS = d; }).catch(function () { YOUTUBE_STATS = null; }),
      invokeAdminFn('admin-x-stats', {}).then(function (d) { X_STATS = d; }).catch(function () { X_STATS = null; }),
      invokeAdminFn('admin-tiktok-stats', {}).then(function (d) { TIKTOK_STATS = d; }).catch(function () { TIKTOK_STATS = null; })
    ]).then(function () {
      if (curPanel === 'marketing') renderMarketing();
    });
  }

  // One line per platform was never going to hold more than a follower
  // count - each connected channel now expands into its own stat grid
  // (same statTile()/dash-stats pattern as every other panel), collapsed
  // by default so four platforms don't turn "Channels" into the tallest
  // card on the page.
  function socialStatTiles(key) {
    if (key === 'discord') {
      var joins = discordJoinsInRange();
      return [
        statTile('Members', DISCORD_STATS.memberCount.toLocaleString('en-US'), null, ''),
        statTile('Online now', DISCORD_STATS.onlineCount != null ? DISCORD_STATS.onlineCount.toLocaleString('en-US') : '—', null, ''),
        statTile('Net joins', joins == null ? '—' : (joins > 0 ? '+' : '') + joins.toLocaleString('en-US'), joins == null ? 'Gathering history' : (RANGE_DAYS ? 'over selected range' : 'since tracking began'), '')
      ];
    }
    if (key === 'youtube') {
      return [
        statTile('Subscribers', YOUTUBE_STATS.subscriberCount != null ? YOUTUBE_STATS.subscriberCount.toLocaleString('en-US') : '—', null, ''),
        statTile('Total views', YOUTUBE_STATS.viewCount.toLocaleString('en-US'), null, ''),
        statTile('Videos', YOUTUBE_STATS.videoCount.toLocaleString('en-US'), null, '')
      ];
    }
    if (key === 'x') {
      return [
        statTile('Followers', X_STATS.followersCount.toLocaleString('en-US'), null, ''),
        statTile('Posts', X_STATS.tweetCount.toLocaleString('en-US'), null, ''),
        statTile('Likes given', X_STATS.likeCount.toLocaleString('en-US'), null, ''),
        statTile('Following', X_STATS.followingCount.toLocaleString('en-US'), null, '')
      ];
    }
    if (key === 'tiktok') {
      return [
        statTile('Followers', TIKTOK_STATS.followerCount.toLocaleString('en-US'), null, ''),
        statTile('Likes', TIKTOK_STATS.likesCount.toLocaleString('en-US'), null, ''),
        statTile('Videos', TIKTOK_STATS.videoCount.toLocaleString('en-US'), null, '')
      ];
    }
    return [];
  }

  function channelRow(c) {
    var connected = false, value = '', sub = c.note;
    if (c.key === 'discord' && DISCORD_STATS.memberCount != null) {
      connected = true;
      value = DISCORD_STATS.memberCount.toLocaleString('en-US') + ' members';
      sub = (DISCORD_STATS.onlineCount != null ? DISCORD_STATS.onlineCount.toLocaleString('en-US') + ' online' : c.note);
    } else if (c.key === 'youtube' && YOUTUBE_STATS && YOUTUBE_STATS.configured && YOUTUBE_STATS.subscriberCount != null) {
      connected = true;
      value = YOUTUBE_STATS.subscriberCount.toLocaleString('en-US') + ' subscribers';
      sub = YOUTUBE_STATS.viewCount.toLocaleString('en-US') + ' total views';
    } else if (c.key === 'x' && X_STATS && X_STATS.configured) {
      connected = true;
      value = X_STATS.followersCount.toLocaleString('en-US') + ' followers';
      sub = X_STATS.tweetCount.toLocaleString('en-US') + ' posts';
    } else if (c.key === 'tiktok' && TIKTOK_STATS && TIKTOK_STATS.configured) {
      connected = true;
      value = TIKTOK_STATS.followerCount.toLocaleString('en-US') + ' followers';
      sub = TIKTOK_STATS.videoCount.toLocaleString('en-US') + ' videos';
    } else if (c.needs) {
      sub = c.needs;
    }

    var summaryInner = '<div class="adm-channel-main"><span class="adm-channel-name">' + esc(c.name) + '</span>' +
      '<span class="adm-sub">' + esc(sub) + '</span></div>' +
      '<span class="adm-channel-trail">' +
      (connected
        ? '<span class="adm-channel-val">' + esc(value) + '</span><span class="dt-badge ok">Connected</span>'
        : (c.key === 'tiktok'
            ? '<a class="btn btn-ghost adm-btn-sm" href="' + esc(tiktokAuthorizeUrl()) + '">Connect TikTok</a>'
            : '<span class="dt-badge">Not connected</span>')) +
      (connected ? '<svg class="adm-collapse-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' : '') +
      '</span>';

    if (!connected) return '<div class="adm-channel-row">' + summaryInner + '</div>';

    return '<details class="adm-collapse adm-channel-collapse">' +
      '<summary class="adm-channel-row">' + summaryInner + '</summary>' +
      '<div class="adm-collapse-body"><div class="dash-stats">' + socialStatTiles(c.key).join('') + '</div></div>' +
      '</details>';
  }

  /* ================================================================
     CAMPAIGN LINKS

     Admin-managed trackable links (?cmp=CODE), separate from the
     user-to-user referral program. A click is counted the moment the
     link is visited (track-campaign-click); a conversion is any paid
     order whose campaign_code matches, which works for guest checkouts
     too since it isn't tied to a signed-in profile the way referrals are.
     ================================================================ */
  var CAMPAIGNS = [];
  function refreshCampaigns() {
    return invokeAdminFn('admin-campaign-links', { action: 'list' }).then(function (d) {
      CAMPAIGNS = d.links || [];
      if (curPanel === 'marketing') renderMarketing();
    }).catch(function (err) { console.error('[admin] failed to load campaigns:', err.message); });
  }
  function campaignUrl(c) {
    return location.origin + c.destination + (c.destination.indexOf('?') >= 0 ? '&' : '?') + 'cmp=' + encodeURIComponent(c.code);
  }
  function renderCampaigns() {
    var body = $('admCampaignsBody'); if (!body) return;
    body.innerHTML = CAMPAIGNS.map(function (c) {
      var rate = c.conversionRate == null ? '—' : (c.conversionRate * 100).toFixed(1) + '%';
      return '<tr data-id="' + esc(c.id) + '" data-code="' + esc(c.code) + '">' +
        '<td><strong>' + esc(c.label) + '</strong><div class="adm-sub adm-campaign-url">' + esc(campaignUrl(c)) + '</div></td>' +
        '<td>' + c.clicks.toLocaleString('en-US') + '</td>' +
        '<td>' + c.conversions.toLocaleString('en-US') + '</td>' +
        '<td>' + rate + '</td>' +
        '<td>' + usd(c.revenue) + '</td>' +
        '<td>' + (c.active ? statusBadge('completed') : statusBadge('refunded')) + '</td>' +
        '<td class="adm-row-actions">' +
          '<button class="adm-icon-btn adm-campaign-copy" type="button" title="Copy link" aria-label="Copy link">' + ADM_ICON_COPY + '</button>' +
          '<button class="adm-icon-btn adm-campaign-info" type="button" title="Details" aria-label="Details">' + ADM_ICON_INFO + '</button>' +
          '<button class="adm-icon-btn adm-campaign-toggle" type="button" title="' + (c.active ? 'Deactivate' : 'Activate') + '">' + (c.active ? ADM_ICON_PAUSE : ADM_ICON_PLAY) + '</button>' +
          '<button class="adm-icon-btn adm-campaign-rename" type="button" title="Rename">' + ADM_ICON_EDIT + '</button>' +
          '<button class="adm-icon-btn adm-campaign-delete" type="button" title="Delete">' + ADM_ICON_TRASH + '</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No campaign links yet - add one above.</td></tr>';
  }

  var campaignCreateForm = $('admCampaignCreateForm');
  if (campaignCreateForm) campaignCreateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var codeEl = $('admCampaignCode'), labelEl = $('admCampaignLabel'), destEl = $('admCampaignDestination'), msgEl = $('admCampaignCreateMsg');
    var label = labelEl.value;
    invokeAdminFn('admin-campaign-links', { action: 'create', code: codeEl.value, label: label, destination: destEl.value || '/' }, 'Could not create campaign.').then(function () {
      codeEl.value = ''; labelEl.value = ''; destEl.value = ''; if (msgEl) msgEl.textContent = '';
      logAudit('Created campaign link "' + label + '"');
      return refreshCampaigns();
    }).catch(function (err) { if (msgEl) msgEl.textContent = err.message || 'Could not create campaign.'; });
  });

  var campaignsBody = $('admCampaignsBody');
  if (campaignsBody) campaignsBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var id = tr.getAttribute('data-id'), code = tr.getAttribute('data-code');
    var c = CAMPAIGNS.filter(function (x) { return x.id === id; })[0]; if (!c) return;

    if (e.target.closest('.adm-campaign-copy')) {
      copyCampaignLink(campaignUrl(c), e.target.closest('.adm-campaign-copy'));
    } else if (e.target.closest('.adm-campaign-info')) {
      openCampaignDetail(c);
    } else if (e.target.closest('.adm-campaign-toggle')) {
      invokeAdminFn('admin-campaign-links', { action: 'update', id: id, patch: { active: !c.active } }, 'Could not update campaign.').then(function () {
        logAudit((c.active ? 'Deactivated' : 'Activated') + ' campaign link "' + c.label + '"');
        return refreshCampaigns();
      }).catch(function (err) { alert(err.message || 'Could not update campaign.'); });
    } else if (e.target.closest('.adm-campaign-rename')) {
      var newLabel = prompt('Rename campaign link:', c.label);
      if (newLabel == null || !newLabel.trim() || newLabel === c.label) return;
      invokeAdminFn('admin-campaign-links', { action: 'update', id: id, patch: { label: newLabel.trim() } }, 'Could not rename campaign.').then(function () {
        logAudit('Renamed campaign link "' + c.label + '" to "' + newLabel.trim() + '"');
        return refreshCampaigns();
      }).catch(function (err) { alert(err.message || 'Could not rename campaign.'); });
    } else if (e.target.closest('.adm-campaign-delete')) {
      if (!confirm('Delete the campaign link "' + c.label + '" (?cmp=' + code + ')? This does not affect past orders, only future click tracking.')) return;
      invokeAdminFn('admin-campaign-links', { action: 'delete', id: id }, 'Could not delete campaign.').then(function () {
        logAudit('Deleted campaign link "' + c.label + '"');
        return refreshCampaigns();
      }).catch(function (err) { alert(err.message || 'Could not delete campaign.'); });
    }
  });

  function copyCampaignLink(url, btn) {
    var done = function () {
      if (!btn) return;
      var prev = btn.innerHTML;
      btn.innerHTML = ADM_ICON_CHECK;
      setTimeout(function () { btn.innerHTML = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { prompt('Copy this link:', url); });
    } else {
      prompt('Copy this link:', url);
    }
  }

  function openCampaignDetail(c) {
    var overlay = $('admCampaignDetailOverlay'); if (!overlay) return;
    $('admCampaignDetailTitle').textContent = c.label;
    $('admCampaignDetailSub').innerHTML = '<span class="adm-campaign-url">' + esc(campaignUrl(c)) + '</span> · added ' + fmtDate(new Date(c.createdAt));
    var rate = c.conversionRate == null ? '—' : (c.conversionRate * 100).toFixed(1) + '%';
    $('admCampaignDetailStats').innerHTML = [
      statTile('Clicks', c.clicks.toLocaleString('en-US'), null, ''),
      statTile('Conversions', c.conversions.toLocaleString('en-US'), null, ''),
      statTile('Conversion rate', rate, null, ''),
      statTile('Revenue', usd(c.revenue), null, '')
    ].join('');
    $('admCampaignDetailBody').innerHTML = '<tr><td colspan="4" class="adm-empty">Loading…</td></tr>';
    overlay.hidden = false;

    invokeAdminFn('admin-campaign-links', { action: 'detail', code: c.code }, 'Could not load details.').then(function (d) {
      var orders = d.orders || [];
      $('admCampaignDetailBody').innerHTML = orders.map(function (o) {
        return '<tr><td>' + fmtDate(new Date(o.createdAt)) + '</td><td>' + esc(o.buyer) + '</td><td>' + usd(o.totalUsd) + '</td>' +
          '<td>' + statusBadge(o.status === 'paid' ? 'completed' : o.status) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="adm-empty">No orders attributed to this link yet.</td></tr>';
    }).catch(function (err) {
      $('admCampaignDetailBody').innerHTML = '<tr><td colspan="4" class="adm-empty">' + esc(err.message || 'Could not load details.') + '</td></tr>';
    });
  }
  var campaignDetailClose = $('admCampaignDetailClose');
  if (campaignDetailClose) campaignDetailClose.addEventListener('click', function () { $('admCampaignDetailOverlay').hidden = true; });
  var campaignDetailOverlay = $('admCampaignDetailOverlay');
  if (campaignDetailOverlay) campaignDetailOverlay.addEventListener('click', function (e) { if (e.target === campaignDetailOverlay) campaignDetailOverlay.hidden = true; });

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

    renderCampaigns();

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
          '<td>' + (sv.last_sent_at ? fmtDateTime(parseAdbloxUtc(sv.last_sent_at)) : '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="adm-empty">No server activity yet.</td></tr>';
    }

    if ($('admAdbloxLogsBody')) {
      $('admAdbloxLogsBody').innerHTML = ADBLOX_LOGS.map(function (lg) {
        var status = lg.status === 'sent' ? '<span class="dt-badge ok">Sent</span>' : lg.status === 'failed' ? '<span class="dt-badge err">Failed</span>' : '<span class="dt-badge warn">' + esc(lg.status) + '</span>';
        return '<tr><td>' + (lg.sent_at ? fmtDateTime(parseAdbloxUtc(lg.sent_at)) : '—') + '</td>' +
          '<td>' + esc(lg.ad_title || '') + '</td>' +
          '<td>' + esc(lg.guild_name || lg.guild_id || '') + '</td>' +
          '<td>' + esc(lg.channel_name || lg.channel_id || '') + '</td>' +
          '<td>' + status + (lg.error_message ? ' <span class="adm-sub" title="' + esc(lg.error_message) + '">⚠</span>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="adm-empty">No activity yet.</td></tr>';
      var loadMoreBtn = $('admAdbloxLoadMore');
      if (loadMoreBtn) loadMoreBtn.hidden = !ADBLOX_NEXT_CURSOR;
    }

    renderEmailMarketing();
    renderAutomations();

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

  // Two source modes share one textarea: 'simple' runs it through the
  // markdown-lite converter above, 'html' sends it through untouched (the
  // admin is authoring real markup directly). Whichever mode is active
  // decides what bodyHtml() returns and what the preview iframe renders.
  var campaignMode = 'simple';
  function campaignBodyHtml() {
    var raw = $('admCampaignBody').value;
    return campaignMode === 'html' ? raw : simpleMarkdownToHtml(raw);
  }
  var campaignModeSwitch = document.querySelector('.adm-campaign-mode');
  if (campaignModeSwitch) campaignModeSwitch.addEventListener('click', function (e) {
    var btn = e.target.closest('.bt-opt');
    if (!btn) return;
    campaignMode = btn.getAttribute('data-mode');
    campaignModeSwitch.querySelectorAll('.bt-opt').forEach(function (o) {
      var active = o === btn;
      o.classList.toggle('active', active);
      o.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    var bodyEl = $('admCampaignBody');
    var labelEl = $('admCampaignBodyLabel');
    if (bodyEl) bodyEl.placeholder = campaignMode === 'html'
      ? '<p>Write raw HTML here. It is sent to Resend exactly as written.</p>'
      : 'Write your email. Blank lines start a new paragraph, **text** for bold.';
    if (labelEl) labelEl.textContent = campaignMode === 'html' ? 'Body (raw HTML)' : 'Body';
    updateCampaignPreview();
  });

  // Shared by the campaign composer and each automation's own preview -
  // same shell either way, since both send through the same Resend path.
  function emailPreviewDoc(bodyHtml) {
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<style>body{margin:0;padding:20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
      'font-size:15px;line-height:1.5;color:#1a1a1a;background:#fff;} img{max-width:100%;}</style>' +
      '</head><body>' + bodyHtml + '</body></html>';
  }
  function updateCampaignPreview() {
    var frame = $('admCampaignPreviewFrame');
    if (!frame || $('admCampaignPreviewWrap').hidden) return;
    frame.srcdoc = emailPreviewDoc(campaignBodyHtml());
  }
  // Delegated rather than bound once to the button itself - this whole
  // panel re-renders sub-sections of itself repeatedly (every stats/
  // campaigns/automations refresh calls back into renderMarketing()), and
  // a listener bound directly to a node that later gets replaced by an
  // innerHTML rebuild elsewhere silently stops firing. Delegating from
  // document survives that regardless of which nodes get rebuilt.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#admCampaignPreviewBtn');
    if (!btn) return;
    var wrap = $('admCampaignPreviewWrap');
    if (!wrap) return;
    var open = wrap.hidden;
    wrap.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Hide preview' : 'Preview';
    if (open) updateCampaignPreview();
  });
  document.addEventListener('input', function (e) {
    if (!e.target.closest('#admCampaignBody')) return;
    var wrap = $('admCampaignPreviewWrap');
    if (wrap && !wrap.hidden) updateCampaignPreview();
  });

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
      invokeAdminFn('admin-send-campaign', { action: 'send', subject: subject, bodyHtml: campaignBodyHtml() }, 'Could not send campaign.').then(function (data) {
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
    invokeAdminFn('admin-send-campaign', { action: 'test', subject: subject, bodyHtml: campaignBodyHtml(), testEmail: testEmail }, 'Could not send test.').then(function () {
      if (msg) msg.textContent = 'Test sent to ' + testEmail + '.';
    }).catch(function (err) {
      if (msg) msg.textContent = err.message;
    }).then(function () {
      campaignTestBtn.disabled = false;
    });
  });

  /* ================================================================
     LIFECYCLE AUTOMATIONS (abandoned cart steps, review request,
     re-engagement) - admin-editable rows in email_automations, all
     evaluated by the same cron-lifecycle-emails run every 30 min.
     ================================================================ */
  var AUTOMATIONS = {};
  var AUTOMATION_META = [
    { key: 'abandoned_cart_1', label: 'Abandoned cart · step 1', hint: 'Hours after a cart goes stale.' },
    { key: 'abandoned_cart_2', label: 'Abandoned cart · step 2', hint: 'Hours after step 1 would have sent.' },
    { key: 'abandoned_cart_3', label: 'Abandoned cart · step 3', hint: 'Hours after step 2 would have sent.' },
    { key: 'post_purchase_review', label: 'Post-purchase review request', hint: 'Hours after an order is marked paid.' },
    { key: 'reengagement', label: 'Re-engagement', hint: 'Hours since last purchase (or signup, if they never bought) before we call the account lapsed. Sent once.' }
  ];

  function refreshAutomations() {
    if (!window.coldSupabase) return Promise.resolve();
    return window.coldSupabase.from('email_automations').select('*').then(function (res) {
      if (res.error) { console.error('[admin] failed to load automations:', res.error.message); return; }
      AUTOMATIONS = {};
      (res.data || []).forEach(function (row) { AUTOMATIONS[row.key] = row; });
      if (curPanel === 'marketing') renderAutomations();
    });
  }

  function renderAutomations() {
    var el = $('admAutomationsBody'); if (!el) return;
    el.innerHTML = AUTOMATION_META.map(function (meta) {
      var a = AUTOMATIONS[meta.key] || { enabled: false, delay_hours: 24, subject: '', body_md: '' };
      var statusBadge = a.enabled ? '<span class="dt-badge ok">On</span>' : '<span class="dt-badge">Off</span>';
      return '<details class="adm-collapse" style="background:rgba(255,255,255,0.02);margin-top:14px;padding:16px 18px;border-radius:10px;">' +
        '<summary class="dash-card-head" style="margin-bottom:0;"><div><h2 style="font-size:14px;">' + esc(meta.label) + '</h2></div><span style="display:flex;align-items:center;gap:10px;">' + statusBadge + '<svg class="adm-collapse-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>' +
        '<div class="adm-form adm-collapse-body" style="flex-direction:column;align-items:stretch;gap:10px;max-height:none;margin-top:14px;" data-automation-key="' + meta.key + '">' +
        '<label class="adm-field-check"><input type="checkbox" class="am-enabled"' + (a.enabled ? ' checked' : '') + ' /><span>Enabled</span></label>' +
        '<label class="adm-field"><span>Delay (hours) - ' + esc(meta.hint) + '</span><input type="number" class="adm-input am-delay" min="1" value="' + esc(a.delay_hours) + '" style="max-width:140px;" /></label>' +
        '<label class="adm-field"><span>Subject</span><input type="text" class="adm-input am-subject" value="' + esc(a.subject) + '" /></label>' +
        '<label class="adm-field"><span>Body</span><textarea class="adm-input adm-textarea am-body" rows="4">' + esc(a.body_md) + '</textarea></label>' +
        '<div style="display:flex;gap:8px;align-items:center;"><button class="btn btn-primary adm-btn-sm am-save" type="button">Save</button>' +
        '<button class="btn btn-ghost adm-btn-sm am-preview" type="button" aria-expanded="false">Preview</button><span class="adm-edit-msg am-msg"></span></div>' +
        '<div class="adm-campaign-preview am-preview-wrap" hidden><div class="adm-campaign-preview-head">Preview</div>' +
        '<iframe class="adm-campaign-preview-frame am-preview-frame" title="Automation email preview" sandbox=""></iframe></div>' +
        '</div></details>';
    }).join('');

    el.querySelectorAll('.am-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('[data-automation-key]');
        var key = wrap.getAttribute('data-automation-key');
        var msg = wrap.querySelector('.am-msg');
        var payload = {
          key: key,
          enabled: wrap.querySelector('.am-enabled').checked,
          delayHours: parseInt(wrap.querySelector('.am-delay').value, 10) || 1,
          subject: wrap.querySelector('.am-subject').value.trim(),
          bodyMd: wrap.querySelector('.am-body').value.trim()
        };
        btn.disabled = true;
        if (msg) msg.textContent = 'Saving…';
        invokeAdminFn('admin-update-automation', payload, 'Could not save.').then(function () {
          if (msg) msg.textContent = 'Saved.';
          logAudit((payload.enabled ? 'Enabled' : 'Updated') + ' automation "' + key + '"');
          return refreshAutomations();
        }).catch(function (err) {
          if (msg) msg.textContent = err.message;
        }).then(function () {
          btn.disabled = false;
        });
      });
    });

    // Renders live from whatever is currently typed, not the last-saved
    // body_md - same "preview what you're about to send" as campaigns.
    el.querySelectorAll('.am-preview').forEach(function (btn) {
      var row = btn.closest('[data-automation-key]');
      var previewWrap = row.querySelector('.am-preview-wrap');
      var frame = row.querySelector('.am-preview-frame');
      var bodyEl = row.querySelector('.am-body');
      function update() { frame.srcdoc = emailPreviewDoc(simpleMarkdownToHtml(bodyEl.value)); }
      btn.addEventListener('click', function () {
        var open = previewWrap.hidden;
        previewWrap.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Hide preview' : 'Preview';
        if (open) update();
      });
      bodyEl.addEventListener('input', function () { if (!previewWrap.hidden) update(); });
    });
  }

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
  var ADM_ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
  var ADM_ICON_INFO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
  var ADM_ICON_PAUSE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  var ADM_ICON_PLAY = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M7 4v16l14-8Z"/></svg>';
  var ADM_ICON_COPY = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ADM_ICON_CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

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
    var rows = sortProducts(allProducts().filter(function (p) {
      return !q || p.title.toLowerCase().indexOf(q) >= 0;
    }));
    $('admProdBody').innerHTML = rows.map(function (p) {
      var rating = (p.rating || 0).toFixed(1);
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><span class="dr-thumb" style="background-image:url(\'' + p.image + '\');width:52px;height:38px;display:inline-block;vertical-align:middle;border-radius:7px;"></span></td>' +
        '<td><a class="adm-prod-name" href="/product?id=' + esc(p.id) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></td>' +
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
    // Robux/DevEx pricing only applies to Roblox products, so Minecraft
    // products shouldn't show a nonsensical Robux conversion hint.
    hint.textContent = (platform === 'Roblox' && usdPrice > 0)
      ? ('DevEx equivalent of ' + usd(usdPrice) + ' ≈ R$ ' + Math.round(usdPrice / DEVEX_USD_PER_ROBUX).toLocaleString('en-US'))
      : '';
  }
  // f.path (real upload, private product-files bucket) opens via a
  // freshly-minted signed URL on click - no permanent URL is ever stored,
  // so there's nothing to go stale. f.url only appears on entries saved
  // before that existed (a blob: URL, dead the moment that tab closed) -
  // shown as plain text since there's nothing left to link to.
  function renderFileList(listId, files, removeClass) {
    var list = $(listId); if (!list) return;
    list.innerHTML = files.map(function (f, i) {
      var name = typeof f === 'string' ? f : (f.name || '');
      var path = typeof f === 'string' ? null : f.path;
      var nameHtml = path
        ? '<a href="#" class="adm-file-open" data-path="' + esc(path) + '">' + esc(name) + '</a>'
        : '<span>' + esc(name) + '</span>';
      return '<div class="adm-file-item">' + nameHtml + '<button type="button" class="adm-icon-btn ' + removeClass + '" data-i="' + i + '">' + ADM_ICON_TRASH + '</button></div>';
    }).join('') || '<p class="adm-empty" style="padding:8px 0;">No files uploaded yet.</p>';
  }
  function renderProofList() { renderFileList('admLegalProofList', editProofFiles, 'adm-proof-remove'); }
  function renderDevProofList() { renderFileList('admLegalDevProofList', editDevProofFiles, 'adm-dev-proof-remove'); }
  document.addEventListener('click', function (e) {
    var link = e.target.closest('.adm-file-open');
    if (!link || !(link.closest('#admLegalProofList') || link.closest('#admLegalDevProofList'))) return;
    e.preventDefault();
    var path = link.getAttribute('data-path');
    var prevText = link.textContent;
    link.textContent = 'Opening…';
    invokeAdminFn('admin-get-download-url', { path: path }, 'Could not open file.').then(function (d) {
      link.textContent = prevText;
      window.open(d.url, '_blank', 'noopener');
    }).catch(function (err) {
      link.textContent = prevText;
      alert(err.message || 'Could not open file.');
    });
  });
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

  function openProductEdit(id) {
    var p = findProduct(id); if (!p) return;
    pendingStoragePath = null;
    $('admEditId').value = p.id;
    $('admEditTitleInput').value = p.title;
    $('admEditPrice').value = p.price;
    $('admEditRobuxPrice').value = p.robuxPrice != null ? p.robuxPrice : '';
    $('admEditWasPrice').value = p.wasPrice != null ? p.wasPrice : '';
    $('admEditPriority').checked = !!p.priority;
    $('admEditFeatured').checked = !!p.featured;
    $('admEditFeaturedOrder').value = p.featuredOrder || 0;
    $('admEditFeaturedOrderWrap').hidden = !p.featured;
    setEditPlatform(p.platform, p.cat, p.subcat);
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) { b.disabled = false; });
    $('admEditSubtext').value = p.desc || '';
    $('admEditLongDesc').value = p.longDesc || '';
    $('admEditResell').checked = !!p.resell;
    $('admEditResellPrice').value = p.resellPrice != null ? p.resellPrice : '';
    $('admEditResellPriceWrap').hidden = !p.resell;
    $('admEditReleased').checked = !!p.visible;
    $('admEditDeleteBtn').hidden = false;
    if ($('admLegalDownloadBtn')) $('admLegalDownloadBtn').hidden = false;
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

  /* ================================================================
     UNRELEASED FILES — staging area for files that aren't real
     products yet. Not part of the products list/filter at all; each
     row is just a Storage upload + a renamable display name.
     ================================================================ */
  var UNRELEASED_FILES = [];
  function loadUnreleasedFiles() {
    return invokeAdminFn('admin-unreleased-files', { action: 'list' }).then(function (d) {
      UNRELEASED_FILES = d.files || [];
      var badge = $('admUnreleasedCount');
      if (badge) { badge.hidden = !UNRELEASED_FILES.length; badge.textContent = UNRELEASED_FILES.length ? '(' + UNRELEASED_FILES.length + ')' : ''; }
      renderAll();
    }).catch(function (err) { console.error('[admin] failed to load unreleased files:', err.message); });
  }
  function renderUnreleasedFiles() {
    var list = $('admUnreleasedList'); if (!list) return;
    list.innerHTML = UNRELEASED_FILES.map(function (f) {
      return '<div class="adm-file-item" data-id="' + esc(f.id) + '">' +
        '<input type="text" class="adm-file-rename" value="' + esc(f.display_name) + '" />' +
        (f.size_bytes ? '<span class="adm-file-meta">' + formatFileSize(f.size_bytes) + '</span>' : '') +
        '<button type="button" class="adm-icon-btn adm-unreleased-remove" title="Delete" aria-label="Delete">' + ADM_ICON_TRASH + '</button>' +
        '</div>';
    }).join('') || '<p class="adm-empty" style="padding:8px 0;">Nothing staged right now — drop a file above to keep track of it.</p>';
  }
  wireDropzone($('admUnreleasedDrop'), $('admUnreleasedInput'), function (files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      uploadToStorage('unreleasedFile', f).then(function (r) {
        return invokeAdminFn('admin-unreleased-files', { action: 'create', storagePath: r.path, displayName: f.name, sizeBytes: f.size });
      }).then(function () {
        return loadUnreleasedFiles();
      }).catch(function (err) { alert(err.message || 'Upload failed.'); });
    });
  });
  var unreleasedList = $('admUnreleasedList');
  if (unreleasedList) {
    unreleasedList.addEventListener('click', function (e) {
      var btn = e.target.closest('.adm-unreleased-remove'); if (!btn) return;
      var row = e.target.closest('.adm-file-item'); if (!row) return;
      var id = row.getAttribute('data-id');
      btn.disabled = true;
      invokeAdminFn('admin-unreleased-files', { action: 'delete', id: id }).then(function () {
        return loadUnreleasedFiles();
      }).catch(function (err) { btn.disabled = false; alert(err.message || 'Could not delete file.'); });
    });
    unreleasedList.addEventListener('blur', function (e) {
      var input = e.target.closest('.adm-file-rename'); if (!input) return;
      var row = e.target.closest('.adm-file-item'); if (!row) return;
      var id = row.getAttribute('data-id');
      var name = input.value.trim();
      var current = (UNRELEASED_FILES.filter(function (f) { return f.id === id; })[0] || {}).display_name || '';
      if (!name || name === current) { input.value = current; return; }
      invokeAdminFn('admin-unreleased-files', { action: 'rename', id: id, displayName: name }).then(function () {
        return loadUnreleasedFiles();
      }).catch(function (err) { input.value = current; alert(err.message || 'Could not rename file.'); });
    }, true);
    unreleasedList.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest('.adm-file-rename')) { e.preventDefault(); e.target.blur(); }
    });
  }
  var openUnreleasedBtn = $('admOpenUnreleasedPanel');
  if (openUnreleasedBtn) openUnreleasedBtn.addEventListener('click', function () { showPanel('unreleased'); });

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
  var editFeaturedBox = $('admEditFeatured');
  if (editFeaturedBox) editFeaturedBox.addEventListener('change', function () { $('admEditFeaturedOrderWrap').hidden = !editFeaturedBox.checked; });

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

  // Real Storage upload (private product-files bucket, kind 'legalDoc') -
  // this used to just wrap the file in a blob: URL, which is only valid
  // for the tab that created it and is already gone by the time the saved
  // product is reopened. A placeholder row shows immediately so a slow
  // upload doesn't look like nothing happened; it gets its real path once
  // the upload resolves, or is removed on failure.
  function addLegalFiles(list, files, rerender) {
    Array.prototype.forEach.call(files, function (f) {
      var row = { name: f.name, path: null };
      list.push(row);
      rerender();
      uploadToStorage('legalDoc', f).then(function (r) {
        row.path = r.path;
        rerender();
      }).catch(function (err) {
        var idx = list.indexOf(row);
        if (idx !== -1) list.splice(idx, 1);
        rerender();
        alert(err.message || 'Could not upload file.');
      });
    });
  }
  wireDropzone($('admLegalProofDrop'), $('admLegalProofInput'), function (files) {
    addLegalFiles(editProofFiles, files, renderProofList);
  });
  var proofList = $('admLegalProofList');
  if (proofList) proofList.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-proof-remove'); if (!btn) return;
    editProofFiles.splice(+btn.getAttribute('data-i'), 1);
    renderProofList();
  });

  wireDropzone($('admLegalDevProofDrop'), $('admLegalDevProofInput'), function (files) {
    addLegalFiles(editDevProofFiles, files, renderDevProofList);
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
    $('admEditWasPrice').value = '';
    $('admEditPriority').checked = false;
    $('admEditFeatured').checked = false;
    $('admEditFeaturedOrder').value = 0;
    $('admEditFeaturedOrderWrap').hidden = true;
    setEditPlatform('Roblox', null);
    document.querySelectorAll('#admEditPlatformToggle .adm-platform-btn').forEach(function (b) { b.disabled = false; });
    $('admEditSubtext').value = '';
    $('admEditLongDesc').value = '';
    $('admEditResell').checked = false;
    $('admEditResellPrice').value = '';
    $('admEditResellPriceWrap').hidden = true;
    $('admEditReleased').checked = false;
    $('admEditDeleteBtn').hidden = true;
    if ($('admLegalDownloadBtn')) $('admLegalDownloadBtn').hidden = true;
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
      // A 0-or-negative Robux price is never actually intended (nothing
      // should cost real USD and be free in Robux) - saved as null (no
      // override, falls back to the flat estimate) instead of a literal
      // 0 that then quotes the product as free everywhere Robux pricing
      // is shown. The old Math.max(0, ...) clamp let exactly that happen
      // silently on any negative or unparseable entry.
      robuxPrice: (function () {
        var v = parseFloat($('admEditRobuxPrice').value);
        return Number.isFinite(v) && v > 0 ? v : null;
      })(),
      wasPrice: (function () {
        var v = parseFloat($('admEditWasPrice').value);
        return Number.isFinite(v) && v > 0 ? v : null;
      })(),
      priority: $('admEditPriority').checked,
      featured: $('admEditFeatured').checked,
      featuredOrder: Math.max(0, parseInt($('admEditFeaturedOrder').value, 10) || 0),
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
          if (msg) msg.textContent = 'Created.';
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
    callUpsertProduct(upsertPayloadFor(p, fields)).then(function () {
      logAudit('Updated product "' + fields.title + '"');
      pendingStoragePath = null;
      return refreshProducts();
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
      if (msg) msg.textContent = 'Saved.';
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
  var legalDownloadBtn = $('admLegalDownloadBtn');
  if (legalDownloadBtn) legalDownloadBtn.addEventListener('click', function () {
    var id = $('admEditId').value;
    var p = findProduct(id); if (!p || !window.coldSupabase) return;
    var btnLabel = legalDownloadBtn.querySelector('.btn-label');
    var btnSpinner = legalDownloadBtn.querySelector('.btn-spinner');
    legalDownloadBtn.disabled = true;
    if (btnSpinner) btnSpinner.hidden = false;
    window.coldSupabase.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      if (!token) throw new Error('Please sign in.');
      // Returns a real .docx binary, not JSON - can't go through
      // invokeAdminFn (which always parses the response as JSON), so this
      // is a plain authenticated fetch straight to the function.
      // Same publishable anon key every other client-side Supabase call on
      // this site already ships (supabase-init.js, lock/index.html) - it's
      // meant to be public, the is_admin gate server-side is what actually
      // protects this endpoint, not keeping this value secret.
      return fetch('https://ekinmytmudjwfaqaqswp.supabase.co/functions/v1/admin-generate-legal-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'sb_publishable_q5JwjFnMT_0Uhu5rAlAkQA_DEGnhwV7',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ productId: p.dbId })
      });
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (data) {
        throw new Error(data.error || 'Could not generate document.');
      });
      return res.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = p.id + '-legal-record.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      logAudit('Downloaded legal record for "' + p.title + '"');
    }).catch(function (err) {
      alert(err.message || 'Could not generate document.');
    }).then(function () {
      legalDownloadBtn.disabled = false;
      if (btnSpinner) btnSpinner.hidden = true;
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
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'revoked', label: 'Revoked' }
  ], 'all');
  function orderRowMenuHtml(o) {
    var items = ['<button type="button" class="adm-row-menu-item" data-action="view">View details</button>'];
    if (o.status === 'pending' && can('support')) items.push('<button type="button" class="adm-row-menu-item" data-action="complete">Mark completed</button>');
    if (o.status === 'completed' && can('support')) {
      items.push('<button type="button" class="adm-row-menu-item" data-action="refund">Refund</button>');
      items.push('<button type="button" class="adm-row-menu-item danger" data-action="revoke">Revoke license</button>');
    }
    return '<div class="adm-row-menu" data-id="' + esc(o.id) + '">' +
      '<button type="button" class="adm-row-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Order actions">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>' +
      '<div class="adm-row-menu-list" hidden>' + items.join('') + '</div></div>';
  }
  function renderOrders() {
    var statusF = orderStatusDropdown.getValue() || 'all';
    var q = (($('admOrderSearch') || {}).value || '').trim().toLowerCase();
    var rows = ORDERS.filter(function (o) {
      if (o.status === 'failed') return false;
      // Pending clutters the default view with checkouts that were opened
      // and never finished - same call as the customer dashboard's own
      // purchase history. Unlike 'failed' this isn't a hard exclude though:
      // a pending order can still be genuinely actionable (a stuck crypto/
      // Robux payment, "Mark completed" below), so filtering to it directly
      // via the status dropdown still works - it's just not what shows by
      // default alongside everything else.
      if (o.status === 'pending' && statusF === 'all') return false;
      var okStatus = statusF === 'all' || o.status === statusF;
      var okQ = !q || o.id.toLowerCase().indexOf(q) >= 0 || o.title.toLowerCase().indexOf(q) >= 0 || o.userName.toLowerCase().indexOf(q) >= 0;
      return okStatus && okQ;
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 200);
    $('admOrdersBody').innerHTML = rows.map(function (o) {
      return '<tr data-id="' + esc(o.id) + '">' +
        '<td>' + fmtDate(new Date(o.date)) + '</td>' +
        '<td class="dt-mono">' + esc(o.id) + '</td>' +
        '<td>' + esc(o.title) + (o.licence === 'resell' ? ' <span class="adm-sub">· resell</span>' : '') + '</td>' +
        '<td>' + esc(o.userName) + '</td>' +
        '<td>' + o.currency.toUpperCase() + '</td>' +
        '<td>' + orderAmount(o) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="adm-row-actions">' + orderRowMenuHtml(o) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="adm-empty">No orders match.</td></tr>';
  }
  var ordersBody = $('admOrdersBody');
  // Listens on document, not ordersBody: openRowMenu() portals the open
  // .adm-row-menu-list to <body> (see its own comment for why), so a click
  // on one of its action items no longer bubbles through ordersBody at
  // all once that's happened. The .contains(menuEl) checks below stand in
  // for the scoping ordersBody used to provide for free - menuEl (the
  // .adm-row-menu wrapper holding the trigger button) never itself moves,
  // only its .adm-row-menu-list child does.
  if (ordersBody) document.addEventListener('click', function (e) {
    var menuBtn = e.target.closest('.adm-row-menu-btn');
    if (menuBtn) {
      var menu = menuBtn.closest('.adm-row-menu');
      if (!ordersBody.contains(menu)) return;
      var wasOpen = menu.classList.contains('open');
      closeAllRowMenus();
      if (!wasOpen) openRowMenu(menu);
      return;
    }
    var actionBtn = e.target.closest('.adm-row-menu-item');
    if (!actionBtn) return;
    var listEl = actionBtn.closest('.adm-row-menu-list');
    var menuEl = listEl && listEl.__ownerMenu;
    if (!menuEl || !ordersBody.contains(menuEl)) return;
    var id = menuEl.getAttribute('data-id');
    var o = ORDERS.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    closeAllRowMenus();
    var action = actionBtn.getAttribute('data-action');

    if (action === 'view') {
      viewOrderId = id;
      showPanel('order-detail');
      return;
    }
    if (action === 'complete') {
      if (!can('support')) return;
      callManageOrder(o.dbId, 'complete').then(function () {
        logAudit('Marked order ' + id + ' completed');
        return refreshOrders();
      }).catch(function (err) { alert(err.message || 'Could not update the order.'); });
    } else if (action === 'refund') {
      if (!can('support')) return;
      var reason = prompt('Refund reason for ' + id + ':', 'Requested by customer'); if (reason === null) return;
      callManageOrder(o.dbId, 'refund', reason || 'Requested by customer').then(function () {
        logAudit('Refunded order ' + id + ' (' + orderAmount(o) + ')');
        return refreshOrders();
      }).catch(function (err) { alert(err.message || 'Could not process the refund.'); });
    } else if (action === 'revoke') {
      if (!can('support')) return;
      if (!confirm('Revoke the license for order ' + id + '? The buyer will immediately lose download access. This does not refund their payment.')) return;
      var revReason = prompt('Reason for revoking (visible in admin only):', 'Policy violation'); if (revReason === null) return;
      callManageOrder(o.dbId, 'revoke', revReason || 'Policy violation').then(function () {
        logAudit('Revoked license for order ' + id + ' — ' + (revReason || 'Policy violation'));
        return refreshOrders();
      }).catch(function (err) { alert(err.message || 'Could not revoke the license.'); });
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.adm-row-menu') || e.target.closest('.adm-row-menu-list')) return;
    closeAllRowMenus();
  });
  var orderSearchInput = $('admOrderSearch');
  if (orderSearchInput) orderSearchInput.addEventListener('input', renderOrders);

  /* ================================================================
     ORDER DETAIL (drill-down from the orders table's row menu)
     ================================================================ */
  var viewOrderId = null;
  function paymentInfoRows(o) {
    var rows = [];
    if (o.paymentProvider) rows.push(['Payment provider', esc(o.paymentProvider)]);
    if (o.stripePaymentIntentId) rows.push(['Stripe payment intent', '<span class="dt-mono">' + esc(o.stripePaymentIntentId) + '</span>']);
    if (o.stripeCheckoutSessionId) rows.push(['Stripe checkout session', '<span class="dt-mono">' + esc(o.stripeCheckoutSessionId) + '</span>']);
    if (o.paypalOrderId) rows.push(['PayPal order ID', '<span class="dt-mono">' + esc(o.paypalOrderId) + '</span>']);
    if (o.paypalCaptureId) rows.push(['PayPal capture ID', '<span class="dt-mono">' + esc(o.paypalCaptureId) + '</span>']);
    if (o.cryptoProvider) rows.push(['Crypto provider', esc(o.cryptoProvider)]);
    if (o.cryptoChargeId) rows.push(['Crypto charge ID', '<span class="dt-mono">' + esc(o.cryptoChargeId) + '</span>']);
    if (o.cryptoPaymentId) rows.push(['Crypto payment ID', '<span class="dt-mono">' + esc(o.cryptoPaymentId) + '</span>']);
    if (o.externalTransactionId) rows.push(['External transaction ID', '<span class="dt-mono">' + esc(o.externalTransactionId) + '</span>']);
    if (o.robloxGamepassId) rows.push(['Roblox gamepass ID', '<span class="dt-mono">' + esc(o.robloxGamepassId) + '</span>']);
    if (o.robloxBuyerId) rows.push(['Roblox buyer ID', '<span class="dt-mono">' + esc(o.robloxBuyerId) + '</span>']);
    if (o.robloxVerificationMethod) rows.push(['Roblox verification', esc(o.robloxVerificationMethod)]);
    return rows;
  }
  function detailRow(label, valueHtml) {
    return '<div class="adm-detail-row"><span class="adm-detail-label">' + esc(label) + '</span><span class="adm-detail-val">' + valueHtml + '</span></div>';
  }
  function renderOrderDetail() {
    var el = $('admOrderDetailBody'); if (!el) return;
    var o = ORDERS.filter(function (x) { return x.id === viewOrderId; })[0];
    if (!o) { el.innerHTML = '<p class="adm-empty">Order not found.</p>'; return; }

    var itemsRows = (o.items || []).map(function (it) {
      return '<tr><td>' + esc(it.title || '') + '</td><td>' + (it.licence === 'resell' ? 'Resell' : 'Standard') + '</td><td>' + (it.qty || 1) + '</td><td>' + usd(it.unit_price_usd || 0) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="adm-empty">No line items.</td></tr>';

    var payRows = paymentInfoRows(o);
    var payHtml = payRows.length
      ? payRows.map(function (r) { return detailRow(r[0], r[1]); }).join('')
      : '<p class="adm-note">No payment reference on file for this order.</p>';

    var canAct = can('support');
    var actions = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;">';
    if (o.status === 'pending' && canAct) actions += '<button class="btn btn-ghost adm-btn-sm" type="button" id="admOdComplete">Mark completed</button>';
    if (o.status === 'completed' && canAct) {
      actions += '<button class="btn btn-ghost adm-btn-sm" type="button" id="admOdRefund">Refund</button>';
      actions += '<button class="btn btn-ghost adm-btn-sm" type="button" id="admOdRevoke" style="color:#ff6b6b;">Revoke license</button>';
    }
    actions += '</div>';

    el.innerHTML =
      '<div class="dash-head"><h1>Order ' + esc(o.id) + '</h1><p>' + statusBadge(o.status) + '</p></div>' +
      '<div class="dash-card glass">' +
        '<div class="dash-card-head"><h2>Overview</h2></div>' +
        detailRow('Placed', fmtDateTime(new Date(o.date))) +
        (o.paidAt ? detailRow('Paid', fmtDateTime(new Date(o.paidAt))) : '') +
        detailRow('Buyer', esc(o.userName) + (o.userEmail ? ' &nbsp;<span class="adm-sub">' + esc(o.userEmail) + '</span>' : '')) +
        detailRow('Source', esc(o.source)) +
        detailRow('Currency', o.currency.toUpperCase()) +
        detailRow('Subtotal', usd(o.subtotal)) +
        (o.couponCode ? detailRow('Coupon', esc(o.couponCode) + ' (&minus;' + usd(o.discount) + ')') : '') +
        detailRow('Total', o.currency === 'robux' ? robuxRaw(o.totalRobux) : usd(o.total)) +
        (o.refundReason ? detailRow(o.status === 'revoked' ? 'Revoke reason' : 'Refund reason', esc(o.refundReason)) : '') +
        actions +
      '</div>' +
      '<div class="dash-card glass dash-tablewrap">' +
        '<div class="dash-card-head"><h2>Items</h2></div>' +
        '<table class="dash-table"><thead><tr><th>Product</th><th>Licence</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>' + itemsRows + '</tbody></table>' +
      '</div>' +
      '<div class="dash-card glass">' +
        '<div class="dash-card-head"><h2>Payment reference</h2></div>' +
        payHtml +
      '</div>';

    var completeBtn = $('admOdComplete');
    if (completeBtn) completeBtn.addEventListener('click', function () {
      completeBtn.disabled = true;
      callManageOrder(o.dbId, 'complete').then(function () {
        logAudit('Marked order ' + o.id + ' completed');
        return refreshOrders();
      }).then(renderOrderDetail).catch(function (err) {
        completeBtn.disabled = false;
        alert(err.message || 'Could not update the order.');
      });
    });
    var refundBtn = $('admOdRefund');
    if (refundBtn) refundBtn.addEventListener('click', function () {
      var reason = prompt('Refund reason for ' + o.id + ':', 'Requested by customer'); if (reason === null) return;
      refundBtn.disabled = true;
      callManageOrder(o.dbId, 'refund', reason || 'Requested by customer').then(function () {
        logAudit('Refunded order ' + o.id + ' (' + orderAmount(o) + ')');
        return refreshOrders();
      }).then(renderOrderDetail).catch(function (err) {
        refundBtn.disabled = false;
        alert(err.message || 'Could not process the refund.');
      });
    });
    var revokeBtn = $('admOdRevoke');
    if (revokeBtn) revokeBtn.addEventListener('click', function () {
      if (!confirm('Revoke the license for order ' + o.id + '? The buyer will immediately lose download access. This does not refund their payment.')) return;
      var revReason = prompt('Reason for revoking (visible in admin only):', 'Policy violation'); if (revReason === null) return;
      revokeBtn.disabled = true;
      callManageOrder(o.dbId, 'revoke', revReason || 'Policy violation').then(function () {
        logAudit('Revoked license for order ' + o.id + ' — ' + (revReason || 'Policy violation'));
        return refreshOrders();
      }).then(renderOrderDetail).catch(function (err) {
        revokeBtn.disabled = false;
        alert(err.message || 'Could not revoke the license.');
      });
    });
  }

  /* ================================================================
     RESELLERS PANEL
     ================================================================ */
  var RESELLERS = [];
  function refreshResellers() {
    return invokeAdminFn('admin-resellers', { action: 'list' }).then(function (d) {
      RESELLERS = (d.resellers || []).map(function (r) {
        return {
          id: r.id,
          email: r.email,
          displayName: r.display_name,
          accountName: r.profiles ? (r.profiles.username || r.profiles.email) : null,
          productTitle: r.products ? r.products.title : null,
          productId: r.product_id,
          sellingWhere: r.selling_where,
          sellingNotes: r.selling_notes,
          status: r.status,
          source: r.source,
          createdAt: r.created_at
        };
      });
      if (curPanel === 'resellers') renderResellers();
    }).catch(function (err) { console.error('[admin] failed to load resellers:', err.message); });
  }
  function renderResellers() {
    var body = $('admResellersBody'); if (!body) return;
    var q = (($('admResellerSearch') || {}).value || '').trim().toLowerCase();
    var rows = RESELLERS.filter(function (r) {
      if (!q) return true;
      return [r.email, r.displayName, r.accountName, r.productTitle].some(function (v) { return v && v.toLowerCase().indexOf(q) >= 0; });
    });
    body.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td>' + esc(r.displayName || r.accountName || r.email) + '<div class="adm-sub">' + esc(r.email) + '</div></td>' +
        '<td>' + esc(r.productTitle || '—') + '</td>' +
        '<td>' + esc(r.sellingWhere) + '</td>' +
        '<td><span class="adm-cat-tag">' + (r.source === 'manual' ? 'Manual' : 'Purchase') + '</span></td>' +
        '<td>' + statusBadge(r.status === 'active' ? 'completed' : 'refunded') + '</td>' +
        '<td>' + fmtDate(new Date(r.createdAt)) + '</td>' +
        '<td class="adm-row-actions"><button class="adm-icon-btn adm-reseller-edit" type="button" title="Edit" aria-label="Edit">' + ADM_ICON_KEBAB + '</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No resellers yet.</td></tr>';
  }
  var resellerSearchEl = $('admResellerSearch');
  if (resellerSearchEl) resellerSearchEl.addEventListener('input', renderResellers);

  var resellerProductDropdown = makeDropdown($('admResellerProductDD'), { valueInput: $('admResellerProductId'), placeholder: 'None' });
  var resellerStatusDropdown = makeDropdown($('admResellerStatusDD'), { valueInput: $('admResellerStatus') });
  resellerStatusDropdown.setOptions([{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }], 'active');

  function openResellerEditor(reseller) {
    resellerProductDropdown.setOptions([{ value: '', label: 'None' }].concat(
      allProducts().filter(function (p) { return p.resell; }).map(function (p) { return { value: p.id, label: p.title }; })
    ), (reseller && reseller.productId) || '');
    resellerStatusDropdown.setValue((reseller && reseller.status) || 'active', true);
    $('admResellerId').value = (reseller && reseller.id) || '';
    $('admResellerEmail').value = (reseller && reseller.email) || '';
    $('admResellerName').value = (reseller && reseller.displayName) || '';
    $('admResellerWhere').value = (reseller && reseller.sellingWhere) || '';
    $('admResellerNotes').value = (reseller && reseller.sellingNotes) || '';
    $('admResellerEditHeading').textContent = reseller ? 'Edit reseller' : 'Add reseller';
    $('admResellerMsg').textContent = '';
    showPanel('reseller-edit');
  }
  var openResellerCreateBtn = $('admOpenResellerCreate');
  if (openResellerCreateBtn) openResellerCreateBtn.addEventListener('click', function () { openResellerEditor(null); });

  var resellersBody = $('admResellersBody');
  if (resellersBody) resellersBody.addEventListener('click', function (e) {
    if (!e.target.closest('.adm-reseller-edit')) return;
    var tr = e.target.closest('tr'); if (!tr) return;
    var r = RESELLERS.filter(function (x) { return x.id === tr.getAttribute('data-id'); })[0];
    if (r) openResellerEditor(r);
  });

  var resellerForm = $('admResellerForm');
  if (resellerForm) resellerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('admResellerId').value;
    var saveBtn = $('admResellerSaveBtn');
    var msgEl = $('admResellerMsg');
    var label = saveBtn.querySelector('.btn-label'), spinner = saveBtn.querySelector('.btn-spinner');
    saveBtn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;

    var payload = {
      email: $('admResellerEmail').value.trim(),
      displayName: $('admResellerName').value.trim(),
      productId: $('admResellerProductId').value || null,
      sellingWhere: $('admResellerWhere').value.trim(),
      sellingNotes: $('admResellerNotes').value.trim()
    };

    var req = id
      ? invokeAdminFn('admin-resellers', { action: 'update', id: id, patch: payload }, 'Could not update reseller.')
      : invokeAdminFn('admin-resellers', { action: 'create', email: payload.email, displayName: payload.displayName, productId: payload.productId, sellingWhere: payload.sellingWhere, sellingNotes: payload.sellingNotes }, 'Could not add reseller.');

    req.then(function () {
      logAudit((id ? 'Updated' : 'Added') + ' reseller ' + payload.email);
      return refreshResellers();
    }).then(function () {
      showPanel('resellers');
    }).catch(function (err) {
      msgEl.textContent = err.message || 'Something went wrong.';
    }).then(function () {
      saveBtn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
    });
  });

  /* ================================================================
     REVIEWS PANEL
     ================================================================ */
  var reviewFilterDropdown = makeDropdown($('admReviewFilterDD'), {
    onChange: function () { renderReviews(); }
  });
  reviewFilterDropdown.setOptions([
    { value: 'new', label: 'New' },
    { value: 'approved', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'all', label: 'All' }
  ], 'new');
  function renderReviews() {
    var f = reviewFilterDropdown.getValue() || 'new';
    var rows = REVIEWS.filter(function (r) { return f === 'all' || (f === 'new' ? !r.adminReviewedAt : r.status === f); }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    $('admReviewsList').innerHTML = rows.map(function (r) {
      var stars = '';
      for (var i = 0; i < 5; i++) stars += '<span class="pd-star ' + (i < r.stars ? 'on' : '') + '">' + (i < r.stars ? '★' : '☆') + '</span>';
      return '<div class="dash-card glass adm-review" data-id="' + r.id + '">' +
        '<div class="adm-review-head"><strong>' + esc(r.user) + '</strong><span class="adm-sub">on ' + esc(r.productTitle) + '</span><span class="adm-sub">' + fmtDate(new Date(r.date)) + '</span>' +
          (!r.adminReviewedAt ? statusBadge('pending') : statusBadge(r.status === 'hidden' ? 'refunded' : 'completed')) + '</div>' +
        '<div class="pd-rev-stars">' + stars + '</div>' +
        '<p class="adm-review-text">' + esc(r.text) + '</p>' +
        (r.reply ? '<div class="adm-review-reply"><strong>Your reply</strong><p>' + esc(r.reply.text) + '</p></div>' : '') +
        '<div class="adm-review-reply-form" hidden>' +
          '<textarea class="adm-input adm-textarea adm-rev-reply-input" rows="2" placeholder="Write a public reply to this review…">' + esc(r.reply ? r.reply.text : '') + '</textarea>' +
          '<button type="button" class="btn btn-primary adm-btn-sm adm-rev-reply-save">Save reply</button>' +
        '</div>' +
        '<div class="adm-row-actions">' +
          (r.status !== 'hidden' ? '<button class="btn btn-ghost adm-btn-sm adm-rev-hide" type="button">Hide</button>' : '') +
          '<button class="btn btn-ghost adm-btn-sm adm-rev-reply-toggle" type="button">' + (r.reply ? 'Edit reply' : 'Reply') + '</button>' +
          '<button class="btn btn-ghost adm-btn-sm adm-rev-goto" type="button">Go to product</button>' +
        '</div></div>';
    }).join('') || '<p class="adm-empty">Nothing here.</p>';

    // Reviews are public the moment they're submitted now - there's no
    // approval step for this panel to gate. Opening it is what clears the
    // "new review" flag driving the dashboard to-do, same as reading an
    // inbox marks it read.
    var unseen = rows.filter(function (r) { return !r.adminReviewedAt; });
    if (unseen.length) {
      Promise.all(unseen.map(function (r) { return callModerateReview(r.dbId, 'seen'); }))
        .then(refreshReviews)
        .catch(function () {});
    }
  }
  var reviewsList = $('admReviewsList');
  if (reviewsList) reviewsList.addEventListener('click', function (e) {
    var card = e.target.closest('.adm-review'); if (!card) return;
    var id = card.getAttribute('data-id');
    var r = REVIEWS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (e.target.classList.contains('adm-rev-hide')) {
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
  var importReviewStarsDropdown = makeDropdown($('admImportReviewStarsDD'), { valueInput: $('admImportReviewStars') });
  importReviewStarsDropdown.setOptions([
    { value: '5', label: '★★★★★ (5)' }, { value: '4', label: '★★★★ (4)' }, { value: '3', label: '★★★ (3)' },
    { value: '2', label: '★★ (2)' }, { value: '1', label: '★ (1)' }
  ], '5');
  var importReviewPlatformDropdown = makeDropdown($('admImportReviewPlatformDD'), { valueInput: $('admImportReviewPlatform') });
  importReviewPlatformDropdown.setOptions(['BuiltByBit', 'ClearlyDev', 'Discord', 'Creator Store', 'Other'], 'BuiltByBit');

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
      importReviewStarsDropdown.setValue('5'); importReviewPlatformDropdown.setValue('BuiltByBit');
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
  // Completed only, matching userSpend above - counting every attempt
  // (including abandoned/pending ones that were never actually paid) made
  // this column contradict Spent right next to it: an account could show
  // "11 orders, $0.00 spent", which reads as broken/fake data even though
  // each number was individually accurate. The full total/pending/completed
  // breakdown is still available in the View more detail modal.
  function userOrderCount(userId) { return ORDERS.filter(function (o) { return o.userId === userId && o.status === 'completed'; }).length; }
  var grantUserDropdown = makeDropdown($('admGrantUserDD'), { valueInput: $('admGrantUser'), placeholder: 'Select user' });
  var grantProductDropdown = makeDropdown($('admGrantProductDD'), { valueInput: $('admGrantProduct'), placeholder: 'Select product' });
  function userRowMenuHtml(u) {
    if (!can('admin')) return '';
    var items = ['<button type="button" class="adm-row-menu-item" data-action="view">View more</button>'];
    if (!u.isAdmin) {
      items.push('<button type="button" class="adm-row-menu-item" data-action="' + (u.status === 'active' ? 'ban' : 'unban') + '">' + (u.status === 'active' ? 'Ban' : 'Unban') + '</button>');
      items.push('<button type="button" class="adm-row-menu-item danger" data-action="remove">Remove account</button>');
    }
    return '<div class="adm-row-menu" data-id="' + esc(u.id) + '">' +
      '<button type="button" class="adm-row-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="User actions">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>' +
      '<div class="adm-row-menu-list" hidden>' + items.join('') + '</div></div>';
  }
  function renderUsers() {
    var q = (($('admUserSearch') || {}).value || '').trim().toLowerCase();
    var rows = USERS.filter(function (u) { return !q || u.name.toLowerCase().indexOf(q) >= 0 || u.email.toLowerCase().indexOf(q) >= 0; });
    $('admUsersBody').innerHTML = rows.map(function (u) {
      return '<tr data-id="' + u.id + '"><td>' + esc(u.name) + (u.isAdmin ? ' <span class="adm-sub">· admin</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + fmtDate(new Date(u.joined)) + '</td><td>' + userOrderCount(u.id) + '</td><td>' + usd(userSpend(u.id)) + '</td>' +
        '<td>' + (u.status === 'active' ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge err">Banned' + (u.banReason ? ' — ' + esc(u.banReason) : '') + '</span>') + '</td>' +
        '<td class="adm-row-actions">' + userRowMenuHtml(u) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="adm-empty">No users match.</td></tr>';

    grantUserDropdown.setOptions(USERS.map(function (u) { return { value: u.id, label: u.name }; }), grantUserDropdown.getValue());
    grantProductDropdown.setOptions(allProducts().map(function (p) { return { value: p.id, label: p.title }; }), grantProductDropdown.getValue());
  }
  var usersBody = $('admUsersBody');
  // See the matching comment on the orders row-menu listener above - same
  // portal-to-<body> reason for listening on document instead of usersBody.
  if (usersBody) document.addEventListener('click', function (e) {
    var menuBtn = e.target.closest('.adm-row-menu-btn');
    if (menuBtn) {
      var menu = menuBtn.closest('.adm-row-menu');
      if (!usersBody.contains(menu)) return;
      var wasOpen = menu.classList.contains('open');
      closeAllRowMenus();
      if (!wasOpen) openRowMenu(menu);
      return;
    }
    var actionBtn = e.target.closest('.adm-row-menu-item');
    if (!actionBtn) return;
    var listEl = actionBtn.closest('.adm-row-menu-list');
    var menuEl = listEl && listEl.__ownerMenu;
    if (!menuEl || !usersBody.contains(menuEl)) return;
    var id = menuEl.getAttribute('data-id');
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    closeAllRowMenus();
    var action = actionBtn.getAttribute('data-action');

    if (!can('admin')) return;
    if (action === 'view') {
      openUserDetailModal(u);
    } else if (action === 'ban' || action === 'unban') {
      var willBan = action === 'ban';
      var reason = null;
      if (willBan) {
        reason = prompt('Reason for banning ' + u.name + ':', 'Violated terms of service');
        if (reason === null) return;
      } else if (!confirm('Unban ' + u.name + '?')) return;
      invokeAdminFn('admin-set-user-banned', { userId: u.id, banned: willBan, reason: reason }, 'Could not update user.').then(function () {
        logAudit((willBan ? 'Banned' : 'Unbanned') + ' user ' + u.name);
        return refreshUsers();
      }).catch(function (err) { alert(err.message || 'Could not update user.'); });
    } else if (action === 'remove') {
      openRemoveAccountModal(u);
    }
  });
  var userSearch = $('admUserSearch');
  if (userSearch) userSearch.addEventListener('input', renderUsers);

  // Full account record for support/legal requests ("what do we have on
  // this person") - everything mapProfileRow carries, plus the order
  // breakdown by status, all in one place instead of scattered across the
  // row's summary columns (which only ever showed completed orders/spend,
  // with no way to see pending/total from the table itself).
  var userDetailOverlay = $('admUserDetailOverlay');
  function closeUserDetailModal() { if (userDetailOverlay) userDetailOverlay.hidden = true; }
  if ($('admUserDetailClose')) $('admUserDetailClose').addEventListener('click', closeUserDetailModal);
  if (userDetailOverlay) userDetailOverlay.addEventListener('click', function (e) { if (e.target === userDetailOverlay) closeUserDetailModal(); });
  function openUserDetailModal(u) {
    if (!userDetailOverlay) return;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    if ($('admUserDetailSub')) $('admUserDetailSub').textContent = u.name;
    set('admUdId', u.id);
    set('admUdEmail', u.email || '—');
    set('admUdJoined', fmtDate(new Date(u.joined)));
    set('admUdRole', u.isAdmin ? 'Admin' : (u.role || 'customer'));
    set('admUdStatus', u.status === 'banned' ? ('Banned' + (u.banReason ? ' — ' + u.banReason : '')) : 'Active');
    set('admUdVerified', u.emailVerified ? 'Yes' : 'No');
    set('admUdDiscord', u.discordId ? ('Linked (' + u.discordId + ')') : 'Not linked');
    set('admUdRoblox', u.robloxId ? ('Linked (' + u.robloxId + ')') : 'Not linked');
    set('admUdMarketing', u.marketingUnsubscribed ? 'Unsubscribed' : 'Subscribed');
    set('admUdRefCode', u.referralCode || '—');
    var referrer = u.referredBy ? USERS.filter(function (x) { return x.id === u.referredBy; })[0] : null;
    set('admUdReferredBy', referrer ? referrer.name : (u.referredBy || '—'));
    var userOrders = ORDERS.filter(function (o) { return o.userId === u.id; })
      .slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    set('admUdOrdersTotal', String(userOrders.length));
    set('admUdOrdersPaid', String(userOrders.filter(function (o) { return o.status === 'completed'; }).length));
    set('admUdOrdersPending', String(userOrders.filter(function (o) { return o.status === 'pending'; }).length));
    set('admUdSpent', usd(userSpend(u.id)));

    // The pop-out this replaces only ever showed counts - this is the
    // actual per-order record (what, when, how much, whether it went
    // through) behind "11 pending orders", so support/ops can see what's
    // really happening for this customer instead of guessing from a number.
    var ordersListEl = $('admUdOrdersList');
    if (ordersListEl) {
      ordersListEl.innerHTML = userOrders.length ? userOrders.map(function (o) {
        var badgeClass = o.status === 'completed' ? 'ok' : o.status === 'pending' ? 'warn' : 'err';
        var amount = o.currency === 'robux' ? (o.totalRobux ? o.totalRobux.toLocaleString('en-US') + ' R$' : usd(o.total)) : usd(o.total);
        return '<div class="adm-ud-order-row">' +
          '<span class="adm-ud-order-date">' + fmtDate(new Date(o.date)) + '</span>' +
          '<span class="adm-ud-order-title">' + esc(o.title) + '</span>' +
          '<span class="adm-ud-order-total">' + esc(amount) + '</span>' +
          '<span class="dt-badge ' + badgeClass + '">' + esc(o.status) + '</span>' +
          '</div>';
      }).join('') : '<p class="adm-empty">No orders yet.</p>';
    }

    // Same already-collected data the abandoned-cart recovery emails run
    // on (public.cart_snapshots) - not a new tracking surface, just
    // surfacing it here too instead of only in the separate Marketing
    // panel. Matched by user_id first (reliable for anyone signed in when
    // they left items in cart); email is a fallback for the rare case a
    // snapshot was written before the row picked up a user_id.
    var cartSection = $('admUdCartSection');
    var cart = ABANDONED.filter(function (c) { return c.userId === u.id || (u.email && c.email === u.email); })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0];
    if (cartSection) {
      if (cart) {
        cartSection.hidden = false;
        var cartHtml = '<div class="adm-ud-cart-row">' +
          (cart.image ? '<img src="' + esc(cart.image) + '" alt="" />' : '') +
          '<div class="adm-ud-cart-info"><div class="adm-ud-cart-title">' + esc(cart.title) + '</div>' +
          '<div class="adm-ud-cart-meta">Last active ' + fmtDate(new Date(cart.date)) +
          (cart.abandonedStep != null ? ' · left at checkout step ' + cart.abandonedStep : '') +
          (cart.recoveryEmailSentAt ? ' · recovery email sent ' + fmtDate(new Date(cart.recoveryEmailSentAt)) : ' · no recovery email sent yet') +
          '</div></div><span class="adm-ud-cart-value">' + usd(cart.value) + '</span></div>';
        cartSection.querySelector('#admUdCartActivity').innerHTML = cartHtml;
      } else {
        cartSection.hidden = true;
      }
    }

    userDetailOverlay.hidden = false;
  }

  // Replaces the stacked native confirm()+prompt() pair this used to be -
  // a plain browser prompt for a "type REMOVE to confirm" step reads as
  // broken/unstyled next to the rest of the panel, and stacking two
  // native dialogs for one destructive action was clunky regardless.
  var removeAcctOverlay = $('admRemoveAcctOverlay');
  var removeAcctSub = $('admRemoveAcctSub');
  var removeAcctInput = $('admRemoveAcctInput');
  var removeAcctMsg = $('admRemoveAcctMsg');
  var removeAcctConfirm = $('admRemoveAcctConfirm');
  var removeAcctCancel = $('admRemoveAcctCancel');
  var removeAcctClose = $('admRemoveAcctClose');
  var removeAcctTarget = null;
  function closeRemoveAcctModal() {
    if (removeAcctOverlay) removeAcctOverlay.hidden = true;
    removeAcctTarget = null;
    if (removeAcctInput) removeAcctInput.value = '';
    if (removeAcctMsg) removeAcctMsg.textContent = '';
    if (removeAcctConfirm) { removeAcctConfirm.disabled = true; removeAcctConfirm.textContent = 'Remove account'; }
  }
  function openRemoveAccountModal(u) {
    if (!removeAcctOverlay) return;
    removeAcctTarget = u;
    if (removeAcctSub) removeAcctSub.textContent = 'Permanently remove ' + u.name + '\'s account? This deletes their login, profile, and everything tied to it - it cannot be undone. Their past orders stay on record.';
    if (removeAcctInput) removeAcctInput.value = '';
    if (removeAcctMsg) removeAcctMsg.textContent = '';
    if (removeAcctConfirm) removeAcctConfirm.disabled = true;
    removeAcctOverlay.hidden = false;
    if (removeAcctInput) removeAcctInput.focus();
  }
  if (removeAcctInput) removeAcctInput.addEventListener('input', function () {
    if (removeAcctConfirm) removeAcctConfirm.disabled = removeAcctInput.value !== 'REMOVE';
  });
  if (removeAcctCancel) removeAcctCancel.addEventListener('click', closeRemoveAcctModal);
  if (removeAcctClose) removeAcctClose.addEventListener('click', closeRemoveAcctModal);
  if (removeAcctOverlay) removeAcctOverlay.addEventListener('click', function (e) { if (e.target === removeAcctOverlay) closeRemoveAcctModal(); });
  if (removeAcctConfirm) removeAcctConfirm.addEventListener('click', function () {
    if (!removeAcctTarget || removeAcctInput.value !== 'REMOVE') return;
    var u = removeAcctTarget;
    removeAcctConfirm.disabled = true;
    removeAcctConfirm.textContent = 'Removing…';
    invokeAdminFn('admin-delete-user', { userId: u.id }, 'Could not remove the account.').then(function () {
      logAudit('Removed account for ' + u.name + ' (' + u.email + ')');
      closeRemoveAcctModal();
      return refreshUsers();
    }).catch(function (err) {
      removeAcctConfirm.disabled = false;
      removeAcctConfirm.textContent = 'Remove account';
      if (removeAcctMsg) removeAcctMsg.textContent = err.message || 'Could not remove the account.';
    });
  });

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
    $('admHomepageView').hidden = type !== 'homepage';
    if (type === 'homepage') renderHomepageTab();
  });

  function callWeeklyDeals(action, productId) {
    var body = { action: action };
    if (productId) body.productId = productId;
    return invokeAdminFn('admin-weekly-deals', body, 'Request failed.');
  }
  function renderHomepageTab() {
    var products = allProducts();

    var featured = products.filter(function (p) { return p.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; });
    $('admFeaturedBody').innerHTML = featured.length ? featured.map(function (p) {
      return '<tr><td>' + p.featuredOrder + '</td><td>' + esc(p.title) + '</td><td>' + usd(p.price) + '</td>' +
        '<td class="adm-row-actions"><button class="btn btn-ghost adm-btn-sm adm-featured-edit" type="button" data-id="' + esc(p.id) + '">Edit product</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="adm-empty">No featured products yet - open a product and check "Featured".</td></tr>';

    var deals = products.filter(function (p) { return p.weeklyDeal; });
    $('admWeeklyDealsBody').innerHTML = deals.length ? deals.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '"><td>' + esc(p.title) + '</td><td>' + usd(p.wasPrice) + '</td><td>' + usd(p.price) + '</td>' +
        '<td>-' + (p.weeklyDealPct != null ? p.weeklyDealPct : Math.round((1 - p.price / p.wasPrice) * 100)) + '%</td>' +
        '<td>' + (p.weeklyDealAuto ? 'Algorithm' : 'Manual') + '</td>' +
        '<td class="adm-row-actions">' +
          (p.weeklyDealAuto ? '<button class="btn btn-ghost adm-btn-sm adm-weekly-revert" type="button" data-id="' + esc(p.id) + '">Revert</button>' : '') +
          '<button class="btn btn-ghost adm-btn-sm adm-weekly-exclude" type="button" data-id="' + esc(p.id) + '">Exclude</button>' +
        '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="adm-empty">No active weekly deals right now.</td></tr>';

    var excluded = products.filter(function (p) { return p.weeklyDealExcluded; });
    $('admWeeklyExcludedCard').hidden = !excluded.length;
    $('admWeeklyExcludedBody').innerHTML = excluded.map(function (p) {
      return '<tr><td>' + esc(p.title) + '</td><td>' + usd(p.price) + '</td>' +
        '<td class="adm-row-actions"><button class="btn btn-ghost adm-btn-sm adm-weekly-include" type="button" data-id="' + esc(p.id) + '">Re-include</button></td></tr>';
    }).join('');
  }

  var featuredBody = $('admFeaturedBody');
  if (featuredBody) featuredBody.addEventListener('click', function (e) {
    var btn = e.target.closest('.adm-featured-edit'); if (!btn) return;
    if (can('admin')) openProductEdit(btn.getAttribute('data-id'));
  });

  function weeklyDealsAction(action, productId, btn) {
    if (!can('admin')) return;
    var msg = $('admWeeklyDealsMsg');
    var label = btn ? btn.querySelector('.btn-label') : null, spinner = btn ? btn.querySelector('.btn-spinner') : null;
    if (btn) { btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false; }
    callWeeklyDeals(action, productId).then(function (res) {
      if (msg) msg.textContent = action === 'run' ? (res.picks && res.picks.length ? 'Picked: ' + res.picks.map(function (p) { return p.title + ' (-' + p.pct + '%)'; }).join(', ') : 'No eligible products found.') : 'Done.';
      return refreshProducts();
    }).then(function () {
      renderHomepageTab();
    }).catch(function (err) {
      if (msg) msg.textContent = err.message || 'Something went wrong.';
    }).then(function () {
      if (btn) { btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true; }
    });
  }
  var weeklyDealsBody = $('admWeeklyDealsBody');
  if (weeklyDealsBody) weeklyDealsBody.addEventListener('click', function (e) {
    var revertBtn = e.target.closest('.adm-weekly-revert');
    var excludeBtn = e.target.closest('.adm-weekly-exclude');
    if (revertBtn) weeklyDealsAction('revert', revertBtn.getAttribute('data-id'), revertBtn);
    else if (excludeBtn) weeklyDealsAction('exclude', excludeBtn.getAttribute('data-id'), excludeBtn);
  });
  var weeklyExcludedBody = $('admWeeklyExcludedBody');
  if (weeklyExcludedBody) weeklyExcludedBody.addEventListener('click', function (e) {
    var includeBtn = e.target.closest('.adm-weekly-include'); if (!includeBtn) return;
    weeklyDealsAction('include', includeBtn.getAttribute('data-id'), includeBtn);
  });
  var runNowBtn = $('admWeeklyDealsRunNow');
  if (runNowBtn) runNowBtn.addEventListener('click', function () { weeklyDealsAction('run', null, runNowBtn); });
  var revertAllBtn = $('admWeeklyDealsRevertAll');
  if (revertAllBtn) revertAllBtn.addEventListener('click', function () {
    if (!confirm('Revert every algorithm-picked weekly deal back to normal price?')) return;
    weeklyDealsAction('revertAll', null, revertAllBtn);
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
    $('admSiteMgmtUsersView').hidden = view !== 'users';
    $('admSiteMgmtAuditView').hidden = view !== 'audit';
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
     SITE ACCESS PANEL (open / maintenance)
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
      var maintFields = $('admSiteMaintFields');
      if (maintFields) maintFields.hidden = siteMode !== 'maintenance';
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
      var maintFields = $('admSiteMaintFields');
      if (maintFields) maintFields.hidden = siteMode !== 'maintenance';
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
  var postCategoryDropdown = makeDropdown($('admNewPostCategoryDD'), { valueInput: $('admNewPostCategory') });
  postCategoryDropdown.setOptions(['Devlog', 'Studio News', 'Craft'], 'Devlog');
  function fillPostForm(p) {
    $('admPostEditId').value = p.id;
    $('admNewPostTitle').value = p.title;
    postCategoryDropdown.setValue(p.category);
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
    postCategoryDropdown.setValue('Devlog');
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
  var tutTrackDropdown = makeDropdown($('admNewTutTrackDD'), { valueInput: $('admNewTutTrack') });
  tutTrackDropdown.setOptions(['Scripting', 'Building', 'Server Setup'], 'Scripting');
  var tutDifficultyDropdown = makeDropdown($('admNewTutDifficultyDD'), { valueInput: $('admNewTutDifficulty') });
  tutDifficultyDropdown.setOptions(['Beginner', 'Intermediate', 'Advanced'], 'Beginner');
  var tutPlatformDropdown = makeDropdown($('admNewTutPlatformDD'), { valueInput: $('admNewTutPlatform') });
  tutPlatformDropdown.setOptions(['Roblox', 'Minecraft', 'Both'], 'Roblox');
  function fillTutForm(t) {
    $('admTutEditId').value = t.id;
    $('admNewTutTitle').value = t.title;
    tutTrackDropdown.setValue(t.track);
    tutDifficultyDropdown.setValue(t.difficulty);
    tutPlatformDropdown.setValue(t.platform);
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
    tutTrackDropdown.setValue('Scripting'); tutDifficultyDropdown.setValue('Beginner'); tutPlatformDropdown.setValue('Roblox');
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
  var relKindDropdown = makeDropdown($('admNewRelKindDD'), { valueInput: $('admNewRelKind') });
  relKindDropdown.setOptions(['Feature', 'Fix', 'Announcement'], 'Feature');
  function fillRelForm(r) {
    $('admRelEditId').value = r.id;
    $('admNewRelVersion').value = r.version || '';
    relKindDropdown.setValue(r.kind);
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
    relKindDropdown.setValue('Feature');
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

    $('admAuditBody').innerHTML = rows.map(function (a, i) {
      if (a.kind === 'error') {
        return '<tr class="adm-audit-err-row"><td>' + fmtDateTime(new Date(a.ts)) + '</td>' +
          '<td><span class="adm-err-code">' + esc(a.code || 'ERR-??????') + '</span></td>' +
          '<td>' + esc(a.action) + (a.fnName ? ' <span class="adm-sub">(' + esc(a.fnName) + ')</span>' : '') +
          ' <button type="button" class="adm-err-details-btn" data-idx="' + i + '">Details</button></td></tr>';
      }
      return '<tr><td>' + fmtDateTime(new Date(a.ts)) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td></tr>';
    }).join('') || ('<tr><td colspan="3" class="adm-empty">' +
      (AUDIT.length ? 'No entries match that filter.' : 'No actions logged yet.') + '</td></tr>');

    var body = $('admAuditBody');
    if (body && !body.__errDetailsWired) {
      body.__errDetailsWired = true;
      body.addEventListener('click', function (e) {
        var btn = e.target.closest('.adm-err-details-btn');
        if (!btn) return;
        var row = rows[Number(btn.getAttribute('data-idx'))];
        if (row) openErrDetails(row);
      });
    }
  }

  function openErrDetails(row) {
    var overlay = $('admErrOverlay');
    if (!overlay) return;
    $('admErrCode').textContent = row.code || 'ERR-??????';
    $('admErrKind').textContent = row.errKind || '';
    $('admErrWhen').textContent = fmtDateTime(new Date(row.ts));
    $('admErrMsg').textContent = row.action || '';
    $('admErrUrl').textContent = row.pageUrl || '—';
    $('admErrUA').textContent = row.userAgent || '—';
    $('admErrUser').textContent = row.userId || 'Not signed in';
    var ctxEl = $('admErrContext');
    var ctxWrap = $('admErrContextWrap');
    var hasCtx = row.context && Object.keys(row.context).length;
    if (ctxWrap) ctxWrap.hidden = !hasCtx;
    if (ctxEl && hasCtx) ctxEl.textContent = JSON.stringify(row.context, null, 2);
    var stackWrap = $('admErrStackWrap');
    var stackEl = $('admErrStack');
    if (stackWrap) stackWrap.hidden = !row.stack;
    if (stackEl && row.stack) stackEl.textContent = row.stack;
    overlay.hidden = false;
  }
  var admErrCloseBtn = $('admErrClose');
  if (admErrCloseBtn) admErrCloseBtn.addEventListener('click', function () { $('admErrOverlay').hidden = true; });
  var admErrOverlayEl = $('admErrOverlay');
  if (admErrOverlayEl) admErrOverlayEl.addEventListener('click', function (e) { if (e.target === admErrOverlayEl) admErrOverlayEl.hidden = true; });

  /* ================================================================
     CAREERS
     Backs /careers' role cards (careers.js reads the same table
     directly) - see supabase/career_roles.sql.
     ================================================================ */
  var CAREER_ICONS = [
    { value: 'shield', label: 'Shield' },
    { value: 'doc-check', label: 'Document check' },
    { value: 'tag', label: 'Tag' },
    { value: 'megaphone', label: 'Megaphone' },
    { value: 'search', label: 'Search' },
    { value: 'share', label: 'Share / network' },
    { value: 'wrench', label: 'Toolbox' },
    { value: 'sparkle', label: 'Sparkle / VFX' },
    { value: 'clock', label: 'Clock' }
  ];
  var CAREER_ROLES = [];
  var careerIconDropdown = makeDropdown($('admCareerIconDD'), { placeholder: 'Choose an icon' });
  careerIconDropdown.setOptions(CAREER_ICONS, 'shield');

  function refreshCareerRoles() {
    return window.coldSupabase.from('career_roles')
      .select('id, slug, title, icon, tags, summary, questions, sort_order, active')
      .order('sort_order')
      .then(function (res) {
        if (res.error) { console.error('[refreshCareerRoles] failed:', res.error.message); return; }
        CAREER_ROLES = res.data || [];
        renderCareers();
      });
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function careerRoleMenuHtml(r) {
    var items = [
      '<button type="button" class="adm-row-menu-item" data-action="edit">Edit</button>',
      '<button type="button" class="adm-row-menu-item" data-action="toggle">' + (r.active ? 'Deactivate' : 'Activate') + '</button>',
      '<button type="button" class="adm-row-menu-item danger" data-action="delete">Delete</button>'
    ];
    return '<div class="adm-row-menu" data-id="' + esc(r.id) + '">' +
      '<button type="button" class="adm-row-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Role actions">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg></button>' +
      '<div class="adm-row-menu-list" hidden>' + items.join('') + '</div></div>';
  }

  function renderCareers() {
    var body = $('admCareersBody');
    if (!body) return;
    body.innerHTML = CAREER_ROLES.map(function (r) {
      var tags = (r.tags || []).join(', ');
      return '<tr' + (r.active ? '' : ' style="opacity:0.5;"') + '>' +
        '<td>' + esc(r.sort_order) + '</td>' +
        '<td>' + esc(r.title) + '</td>' +
        '<td class="adm-sub">' + esc(tags) + '</td>' +
        '<td>' + (r.active ? '<span class="dt-badge ok">Active</span>' : '<span class="dt-badge">Hidden</span>') + '</td>' +
        '<td class="adm-row-actions">' + careerRoleMenuHtml(r) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="adm-empty">No roles yet - add one above.</td></tr>';
  }

  var careersBody = $('admCareersBody');
  if (careersBody) document.addEventListener('click', function (e) {
    var menuBtn = e.target.closest('.adm-row-menu-btn');
    if (menuBtn) {
      var menu = menuBtn.closest('.adm-row-menu');
      if (!careersBody.contains(menu)) return;
      var wasOpen = menu.classList.contains('open');
      closeAllRowMenus();
      if (!wasOpen) openRowMenu(menu);
      return;
    }
    var actionBtn = e.target.closest('.adm-row-menu-item');
    if (!actionBtn) return;
    var listEl = actionBtn.closest('.adm-row-menu-list');
    var menuEl = listEl && listEl.__ownerMenu;
    if (!menuEl || !careersBody.contains(menuEl)) return;
    var id = menuEl.getAttribute('data-id');
    var r = CAREER_ROLES.filter(function (x) { return String(x.id) === id; })[0];
    if (!r) return;
    closeAllRowMenus();
    var action = actionBtn.getAttribute('data-action');
    if (action === 'edit') {
      openCareerForm(r);
    } else if (action === 'toggle') {
      window.coldSupabase.from('career_roles').update({ active: !r.active }).eq('id', r.id).then(function (upRes) {
        if (upRes.error) { alert(upRes.error.message || 'Could not update role.'); return; }
        logAudit((r.active ? 'Deactivated' : 'Activated') + ' career role "' + r.title + '"');
        refreshCareerRoles();
      });
    } else if (action === 'delete') {
      if (!confirm('Delete "' + r.title + '"? This removes it from /careers immediately.')) return;
      window.coldSupabase.from('career_roles').delete().eq('id', r.id).then(function (delRes) {
        if (delRes.error) { alert(delRes.error.message || 'Could not delete role.'); return; }
        logAudit('Deleted career role "' + r.title + '"');
        refreshCareerRoles();
      });
    }
  });

  var careerFormOverlay = $('admCareerFormOverlay');
  function openCareerForm(role) {
    $('admCareerId').value = role ? role.id : '';
    $('admCareerTitle').value = role ? role.title : '';
    $('admCareerTags').value = role ? (role.tags || []).join(', ') : '';
    $('admCareerSummary').value = role ? role.summary : '';
    $('admCareerQuestions').value = role && Array.isArray(role.questions) ? role.questions.join('\n') : '';
    $('admCareerSort').value = role ? role.sort_order : CAREER_ROLES.length;
    $('admCareerActive').checked = role ? role.active : true;
    careerIconDropdown.setValue(role ? role.icon : 'shield', true);
    $('admCareerFormTitle').textContent = role ? 'Edit role' : 'Add role';
    $('admCareerFormSubmit').querySelector('.btn-label').textContent = role ? 'Save role' : 'Add role';
    var msgEl = $('admCareerFormMsg'); if (msgEl) { msgEl.textContent = ''; msgEl.classList.remove('show'); }
    if (careerFormOverlay) careerFormOverlay.hidden = false;
  }
  function closeCareerForm() { if (careerFormOverlay) careerFormOverlay.hidden = true; }
  var admCareerAddBtn = $('admCareerAddBtn');
  if (admCareerAddBtn) admCareerAddBtn.addEventListener('click', function () { openCareerForm(null); });
  var admCareerFormClose = $('admCareerFormClose');
  if (admCareerFormClose) admCareerFormClose.addEventListener('click', closeCareerForm);
  var admCareerFormCancel = $('admCareerFormCancel');
  if (admCareerFormCancel) admCareerFormCancel.addEventListener('click', closeCareerForm);
  if (careerFormOverlay) careerFormOverlay.addEventListener('click', function (e) { if (e.target === careerFormOverlay) closeCareerForm(); });

  var admCareerForm = $('admCareerForm');
  if (admCareerForm) admCareerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('admCareerId').value;
    var title = $('admCareerTitle').value.trim();
    var msgEl = $('admCareerFormMsg');
    if (!title) { if (msgEl) { msgEl.textContent = 'Title is required.'; msgEl.classList.add('show'); } return; }
    var tags = $('admCareerTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var questions = $('admCareerQuestions').value.split('\n').map(function (q) { return q.trim(); }).filter(Boolean);
    var payload = {
      title: title,
      icon: careerIconDropdown.getValue() || 'shield',
      tags: tags,
      summary: $('admCareerSummary').value.trim(),
      questions: JSON.stringify(questions),
      sort_order: Number($('admCareerSort').value) || 0,
      active: $('admCareerActive').checked,
      updated_at: new Date().toISOString()
    };
    var btn = $('admCareerFormSubmit');
    setBtnLoading(btn, true);
    var query;
    if (id) {
      query = window.coldSupabase.from('career_roles').update(payload).eq('id', id);
    } else {
      payload.slug = slugify(title) + '-' + Date.now().toString(36).slice(-4);
      query = window.coldSupabase.from('career_roles').insert(payload);
    }
    query.then(function (res) {
      setBtnLoading(btn, false);
      if (res.error) { if (msgEl) { msgEl.textContent = res.error.message || 'Could not save role.'; msgEl.classList.add('show'); } return; }
      logAudit((id ? 'Updated' : 'Added') + ' career role "' + title + '"');
      closeCareerForm();
      refreshCareerRoles();
    });
  });

  /* ================================================================
     INIT
     ================================================================ */
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
  refreshSocialStats();
  refreshCampaigns();
  refreshAdbloxStats();
  refreshEmailStats();
  refreshEmailCampaigns();
  loadUnreleasedFiles();
  refreshResellers();
  refreshEmailConfigStatus();
  refreshAutomations();
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
