(function () {
  // Captured synchronously - document.currentScript is only valid during
  // this script's initial synchronous execution, not inside the async
  // fetch callbacks below.
  var thisScript = document.currentScript;

  window.imgUrl = function (p) {
    if (!p) return '/banner.jpg';
    if (p.charAt(0) === '/' || /^https?:\/\//.test(p) || p.indexOf('data:') === 0 || p.indexOf('blob:') === 0) return p;
    return '/' + p;
  };

  // ---- SEO for the query-driven detail pages -------------------------------
  // /product, /post and /tutorial are single shells that render whichever
  // record the query string names. The static <head> therefore describes the
  // shell, not the record, so whoever renders the record has to correct the
  // title, canonical, Open Graph tags and structured data afterwards. Without
  // this every product would share one canonical and one link preview.
  (function () {
    var ORIGIN = 'https://coldd.dev';

    function meta(sel, attr, value) {
      var el = document.head.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, sel.replace(/^meta\[[^=]+="|"\]$/g, ''));
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    }

    function absolute(url) {
      if (!url) return ORIGIN + '/banner.jpg';
      if (/^https?:\/\//.test(url)) return url;
      return ORIGIN + (url.charAt(0) === '/' ? '' : '/') + url;
    }

    /* Truncate at a word boundary so descriptions don't end mid-word. */
    function clamp(text, max) {
      var t = String(text || '').replace(/\s+/g, ' ').trim();
      if (t.length <= max) return t;
      var cut = t.slice(0, max);
      var sp = cut.lastIndexOf(' ');
      return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
    }

    window.coldSeo = {
      clamp: clamp,
      abs: absolute,

      /* opts: title, description, path (with query), image, type */
      apply: function (opts) {
        var url = ORIGIN + opts.path;
        var img = absolute(opts.image);
        var desc = clamp(opts.description, 300);

        document.title = opts.title;

        var canon = document.head.querySelector('link[rel="canonical"]');
        if (!canon) {
          canon = document.createElement('link');
          canon.setAttribute('rel', 'canonical');
          document.head.appendChild(canon);
        }
        canon.setAttribute('href', url);

        meta('meta[name="description"]', 'name', desc);
        meta('meta[property="og:type"]', 'property', opts.type || 'website');
        meta('meta[property="og:url"]', 'property', url);
        meta('meta[property="og:title"]', 'property', opts.title);
        meta('meta[property="og:description"]', 'property', desc);
        meta('meta[property="og:image"]', 'property', img);
        meta('meta[property="og:image:alt"]', 'property', opts.title);
        meta('meta[name="twitter:title"]', 'name', opts.title);
        meta('meta[name="twitter:description"]', 'name', desc);
        meta('meta[name="twitter:image"]', 'name', img);

        // The static tags describe banner.jpg. A product shot is a different
        // shape, so stale dimensions would letterbox the preview card.
        ['og:image:width', 'og:image:height'].forEach(function (p) {
          var el = document.head.querySelector('meta[property="' + p + '"]');
          if (el && img !== ORIGIN + '/banner.jpg') el.remove();
        });
      },

      /* Replaces any block this helper wrote earlier, so re-rendering the
         same shell (client-side nav) never stacks duplicates. */
      jsonLd: function (id, data) {
        var prev = document.getElementById(id);
        if (prev) prev.remove();
        if (!data) return;
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.id = id;
        s.textContent = JSON.stringify(data);
        document.head.appendChild(s);
      },

      breadcrumbs: function (items) {
        return {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items.map(function (it, i) {
            return {
              '@type': 'ListItem',
              position: i + 1,
              name: it.name,
              item: ORIGIN + it.path
            };
          })
        };
      }
    };
  })();

  // Fire-and-forget pageview beacon for the admin Analytics panel - no PII,
  // just a random id that resets every browser session. Doesn't block
  // rendering or the catalog fetch below.
  //
  // Gated on analytics consent, which defaults to NO. Note the session id is
  // only minted inside the consented path: an undecided or declining visitor
  // gets no beacon AND no identifier written to sessionStorage.
  (function trackPageview() {
    var sent = false;
    function send() {
      if (sent) return;
      if (!window.coldConsent || !window.coldConsent.allows('analytics')) return;
      sent = true;
      try {
        var sid = sessionStorage.getItem('coldd_session_id');
        if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('coldd_session_id', sid); }
        // Persistent (localStorage) counterpart to the per-session id, so
        // the admin traffic panel can tell a returning visitor from a new
        // one. Still a random opaque id, no PII, only written with the
        // same analytics consent that gates the beacon itself.
        var vid = null;
        try {
          vid = localStorage.getItem('coldd_visitor_id');
          if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('coldd_visitor_id', vid); }
        } catch (e) {}
        if (window.coldSupabase) {
          window.coldSupabase.functions.invoke('track-pageview', { body: { sessionId: sid, path: location.pathname, visitorId: vid } }).catch(function () {});
        }
      } catch (e) {}
    }
    send();
    // Accepting from the banner counts the page it was accepted on, rather
    // than silently starting from the next navigation.
    window.addEventListener('coldd:consent', send);
  })();

  // Site-wide funnel/interaction beacon. window.coldTrack('add_to_cart',
  // { id, price }) / ('checkout_started') / ('search', { q, results }).
  // Same consent gate and same session/visitor ids as the pageview beacon;
  // fire-and-forget, never throws into the caller.
  window.coldTrack = function (type, meta) {
    try {
      if (!window.coldConsent || !window.coldConsent.allows('analytics')) return;
      var sid = null, vid = null;
      try { sid = sessionStorage.getItem('coldd_session_id'); } catch (e) {}
      try { vid = localStorage.getItem('coldd_visitor_id'); } catch (e) {}
      if (window.coldSupabase) {
        window.coldSupabase.functions.invoke('track-event', {
          body: { type: type, sessionId: sid, visitorId: vid, meta: meta || {} }
        }).catch(function () {});
      }
    } catch (e) {}
  };

  window.__CATEGORIES = [{"label": "Resell License", "slug": "resell", "platform": "Roblox", "page": "/assets"}, {"label": "Finished Games & Templates", "slug": "game-templates", "platform": "Roblox", "page": "/assets"}, {"label": "Maps", "slug": "maps", "platform": "Roblox", "page": "/assets"}, {"label": "Scripts & UI", "slug": "scripts-ui", "platform": "Roblox", "page": "/assets"}, {"label": "Graphics", "slug": "graphics", "platform": "Roblox", "page": "/assets"}, {"label": "Buildings", "slug": "buildings", "platform": "Roblox", "page": "/assets"}, {"label": "Assets", "slug": "assets", "platform": "Roblox", "page": "/assets"}, {"label": "Uniforms & Gear", "slug": "uniforms-gear", "platform": "Roblox", "page": "/assets"}, {"label": "Boats", "slug": "boats", "platform": "Roblox", "page": "/assets"}, {"label": "Weapons", "slug": "weapons", "platform": "Roblox", "page": "/assets"}, {"label": "Vehicles", "slug": "vehicles", "platform": "Roblox", "page": "/assets"}, {"label": "Animations & VFX", "slug": "animations-vfx", "platform": "Roblox", "page": "/assets"}];

  // Currency conversion (window.__money/__usd/__robux/__fiat/__currencyMode,
  // and the #curSwitch dropdown). Moved here from app.js: app.js only loads
  // once the Supabase fetch below resolves (see loadDependents/data-then),
  // which is a couple seconds on a cold load. Every .p-price/.p-was on the
  // page is static markup that hardcodes USD, so it painted in USD and then
  // visibly snapped to the visitor's real stored currency once app.js
  // finally showed up. This file runs synchronously as soon as its <script>
  // tag is reached - before that fetch resolves - so doing the conversion
  // here means the first paint is already correct.
  (function () {
    const KEY = 'coldd_currency';
    const ROBUX_PER_USD = 80;

    const FIATS = [
      { code: 'USD', name: 'US Dollar', sym: '$', rate: 1, dec: 2 },
      { code: 'EUR', name: 'Euro', sym: '€', rate: 0.92, dec: 2 },
      { code: 'GBP', name: 'British Pound', sym: '£', rate: 0.79, dec: 2 },
      { code: 'JPY', name: 'Japanese Yen', sym: '¥', rate: 150, dec: 0 },
      { code: 'CNY', name: 'Chinese Yuan', sym: 'CN¥', rate: 7.2, dec: 2 },
      { code: 'CAD', name: 'Canadian Dollar', sym: 'C$', rate: 1.36, dec: 2 },
      { code: 'AUD', name: 'Australian Dollar', sym: 'A$', rate: 1.52, dec: 2 },
      { code: 'CHF', name: 'Swiss Franc', sym: 'Fr', rate: 0.88, dec: 2 },
      { code: 'INR', name: 'Indian Rupee', sym: '₹', rate: 83, dec: 2 },
      { code: 'KRW', name: 'South Korean Won', sym: '₩', rate: 1340, dec: 0 },
      { code: 'BRL', name: 'Brazilian Real', sym: 'R$', rate: 5.0, dec: 2 },
      { code: 'MXN', name: 'Mexican Peso', sym: 'Mex$', rate: 17, dec: 2 },
      { code: 'RUB', name: 'Russian Ruble', sym: '₽', rate: 92, dec: 2 },
      { code: 'ZAR', name: 'South African Rand', sym: 'R', rate: 18.5, dec: 2 },
      { code: 'TRY', name: 'Turkish Lira', sym: '₺', rate: 32, dec: 2 },
      { code: 'SEK', name: 'Swedish Krona', sym: 'kr', rate: 10.5, dec: 2 },
      { code: 'NOK', name: 'Norwegian Krone', sym: 'kr', rate: 10.7, dec: 2 },
      { code: 'DKK', name: 'Danish Krone', sym: 'kr', rate: 6.9, dec: 2 },
      { code: 'PLN', name: 'Polish Złoty', sym: 'zł', rate: 4.0, dec: 2 },
      { code: 'SGD', name: 'Singapore Dollar', sym: 'S$', rate: 1.35, dec: 2 },
      { code: 'HKD', name: 'Hong Kong Dollar', sym: 'HK$', rate: 7.8, dec: 2 },
      { code: 'NZD', name: 'New Zealand Dollar', sym: 'NZ$', rate: 1.64, dec: 2 },
      { code: 'THB', name: 'Thai Baht', sym: '฿', rate: 36, dec: 2 },
      { code: 'PHP', name: 'Philippine Peso', sym: '₱', rate: 56, dec: 2 },
      { code: 'IDR', name: 'Indonesian Rupiah', sym: 'Rp', rate: 15800, dec: 0 },
      { code: 'MYR', name: 'Malaysian Ringgit', sym: 'RM', rate: 4.7, dec: 2 },
      { code: 'AED', name: 'UAE Dirham', sym: 'AED', rate: 3.67, dec: 2 },
      { code: 'SAR', name: 'Saudi Riyal', sym: 'SAR', rate: 3.75, dec: 2 },
      { code: 'ILS', name: 'Israeli Shekel', sym: '₪', rate: 3.7, dec: 2 },
      { code: 'CZK', name: 'Czech Koruna', sym: 'Kč', rate: 23, dec: 2 },
      { code: 'HUF', name: 'Hungarian Forint', sym: 'Ft', rate: 360, dec: 0 },
      { code: 'CLP', name: 'Chilean Peso', sym: 'CLP$', rate: 950, dec: 0 },
      { code: 'COP', name: 'Colombian Peso', sym: 'COL$', rate: 3900, dec: 0 },
      { code: 'ARS', name: 'Argentine Peso', sym: 'ARS$', rate: 900, dec: 0 },
      { code: 'NGN', name: 'Nigerian Naira', sym: '₦', rate: 1500, dec: 0 },
      { code: 'EGP', name: 'Egyptian Pound', sym: 'E£', rate: 48, dec: 2 },
      { code: 'VND', name: 'Vietnamese Dong', sym: '₫', rate: 25000, dec: 0 },
      { code: 'UAH', name: 'Ukrainian Hryvnia', sym: '₴', rate: 40, dec: 2 },
      { code: 'PKR', name: 'Pakistani Rupee', sym: '₨', rate: 278, dec: 0 },
      { code: 'NTD', name: 'New Taiwan Dollar', sym: 'NT$', rate: 32, dec: 2 }
    ];
    const byCode = {}; FIATS.forEach(function (f) { byCode[f.code] = f; });

    let mode = 'fiat';
    let fiatCode = 'USD';
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'robux') mode = 'robux';
      else if (saved && byCode[saved]) fiatCode = saved;
    } catch (_) {}

    function fmtFiat(usd, f) {
      const v = (Number(usd) || 0) * f.rate;
      let s;
      if (f.dec === 0 || Math.abs(v - Math.round(v)) < 1e-9) s = Math.round(v).toLocaleString('en-US');
      else s = v.toLocaleString('en-US', { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec });
      const sym = f.sym.trim();
      return sym.length > 1 ? (sym + ' ' + s) : (sym + s);
    }
    window.__usd = function (usd) { return '$' + (Math.round((Number(usd) || 0) * 100) / 100).toLocaleString('en-US'); };
    window.__robux = function (usd) { return 'R$ ' + Math.round((Number(usd) || 0) * ROBUX_PER_USD).toLocaleString('en-US'); };
    window.__fiat = function (usd) { return fmtFiat(usd, byCode[fiatCode] || byCode.USD); };
    window.__money = function (usd) { return mode === 'robux' ? window.__robux(usd) : fmtFiat(usd, byCode[fiatCode] || byCode.USD); };
    window.__currencyMode = function () { return mode; };
    // Checkout needs to know WHICH fiat is selected, not just how to format
    // it - a conversion note is noise when the buyer is already on USD.
    window.__fiatCode = function () { return fiatCode; };

    const switchEl = document.getElementById('curSwitch');
    const fiatBtn = document.getElementById('curFiat');
    const robuxBtn = document.getElementById('curRobux');
    const menu = document.getElementById('curMenu');
    const search = document.getElementById('curSearch');
    const listEl = document.getElementById('curList');

    let thumb = null;
    if (switchEl) { thumb = document.createElement('span'); thumb.className = 'cur-thumb'; switchEl.insertBefore(thumb, switchEl.firstChild); }
    function moveThumb() {
      if (!thumb) return;
      const t = mode === 'robux' ? robuxBtn : fiatBtn;
      if (!t) return;
      thumb.style.left = t.offsetLeft + 'px';
      thumb.style.width = t.offsetWidth + 'px';
    }

    function applyStatic() {
      document.querySelectorAll('.p-price, .p-was').forEach(function (el) {
        // A settled amount is a historical fact, not a live price. Without
        // this, flipping the currency toggle rewrote what a completed order
        // said the customer paid - a $89 receipt became R$ 7,120, and a
        // USD receipt restated itself in EUR. Opting out here rather than
        // dropping the class keeps the price styling.
        if (el.hasAttribute('data-fixed')) return;
        if (el.getAttribute('data-usd') == null) {
          el.setAttribute('data-usd', parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0);
        }
        el.textContent = window.__money(el.getAttribute('data-usd'));
      });
    }
    function syncUI() {
      if (fiatBtn) {
        fiatBtn.classList.toggle('active', mode === 'fiat');
        fiatBtn.childNodes[0].nodeValue = fiatCode + ' ';
      }
      if (robuxBtn) robuxBtn.classList.toggle('active', mode === 'robux');
      if (listEl) listEl.querySelectorAll('.cur-row').forEach(function (r) {
        r.classList.toggle('active', mode === 'fiat' && r.getAttribute('data-code') === fiatCode);
      });
      moveThumb();
    }
    function apply() {
      try { localStorage.setItem(KEY, mode === 'robux' ? 'robux' : fiatCode); } catch (_) {}
      applyStatic(); syncUI();
      window.dispatchEvent(new Event('currencychange'));
    }

    function buildList() {
      if (!listEl) return;
      listEl.innerHTML = '';
      FIATS.forEach(function (f) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cur-row'; b.setAttribute('data-code', f.code);
        b.setAttribute('data-search', (f.code + ' ' + f.name).toLowerCase());
        b.innerHTML = '<span class="cr-sym">' + f.sym + '</span><span class="cr-code">' + f.code +
                      '</span><span class="cr-name">' + f.name + '</span>';
        b.addEventListener('click', function () {
          fiatCode = f.code; mode = 'fiat'; apply(); closeMenu();
        });
        listEl.appendChild(b);
      });
    }
    function filterList(q) {
      q = (q || '').trim().toLowerCase();
      let shown = 0;
      listEl.querySelectorAll('.cur-row').forEach(function (r) {
        const ok = !q || r.getAttribute('data-search').indexOf(q) >= 0;
        r.style.display = ok ? '' : 'none'; if (ok) shown++;
      });
      let empty = listEl.querySelector('.cur-empty');
      if (!shown && !empty) { empty = document.createElement('div'); empty.className = 'cur-empty'; empty.textContent = 'No currency found'; listEl.appendChild(empty); }
      else if (shown && empty) empty.remove();
    }
    function openMenu() {
      if (!menu) return;
      menu.hidden = false; if (fiatBtn) fiatBtn.setAttribute('aria-expanded', 'true');
      if (search) { search.value = ''; filterList(''); setTimeout(function () { search.focus(); }, 30); }
      syncUI();
    }
    function closeMenu() { if (menu) menu.hidden = true; if (fiatBtn) fiatBtn.setAttribute('aria-expanded', 'false'); }

    if (fiatBtn) fiatBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      mode = 'fiat'; apply();
      menu && menu.hidden ? openMenu() : closeMenu();
    });
    if (robuxBtn) robuxBtn.addEventListener('click', function () { mode = 'robux'; apply(); closeMenu(); });
    if (search) search.addEventListener('input', function () { filterList(search.value); });
    document.addEventListener('click', function (e) {
      if (menu && !menu.hidden && !e.target.closest('#curSwitch')) closeMenu();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu && !menu.hidden) closeMenu(); });

    buildList(); applyStatic(); syncUI();

    requestAnimationFrame(function () { requestAnimationFrame(function () { if (thumb) thumb.classList.add('anim'); }); });
    window.addEventListener('resize', moveThumb);
  })();

  function loadDependents() {
    var target = thisScript && thisScript.parentNode ? thisScript.parentNode : document.body;
    // Each page declares which scripts it needs loaded after the catalog is
    // ready via data-then="a.js,b.js" on this <script> tag, since different
    // pages chain different scripts here (app.js alone; blog.js+app.js;
    // reviews.js+app.js; blog.js+reviews.js+admin.js with no app.js at all).
    var attr = thisScript && thisScript.getAttribute('data-then');
    var scripts = attr ? attr.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['/app.js'];

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
      image: window.imgUrl(row.image),
      cat: row.cat,
      desc: row.description,
      resell: !!row.resell_available,
      priority: !!row.priority,
      featured: !!row.featured,
      featuredOrder: Number(row.featured_order) || 0,
      weeklyDeal: !!row.weekly_deal,
      was: Number(row.was_price) || 0,
      subcat: row.subcat || '',
      reviews: row.reviews_count || 0,
      rating: Number(row.rating) || 0,
      platform: row.platform,
      page: row.page,
      createdAt: row.created_at || null,
      robuxPrice: row.robux_price != null ? Number(row.robux_price) : null,
      resellPrice: row.resell_price_usd != null ? Number(row.resell_price_usd) : null,
      tech: row.tech || {},
      versions: row.versions || [],
      longDesc: row.long_description || '',
      gallery: row.gallery || [],
      video: row.video || ''
    };
  }

  function toReview(row) {
    return {
      id: row.id,
      productId: row.products ? row.products.slug : null,
      user: row.user_name || 'user',
      stars: row.stars,
      text: row.text,
      date: row.created_at,
      reply: row.reply ? { text: row.reply, date: row.reply_at } : null
    };
  }

  function toContentEntry(row) {
    return Object.assign({ id: row.id, slug: row.slug, visible: row.visible, __type: row.type }, row.data || {});
  }

  function pickActiveSale(rows) {
    var today = new Date().toISOString().slice(0, 10);
    var live = rows.filter(function (r) { return today >= r.startDate && today <= r.endDate; });
    return live.length ? live[0] : null;
  }

  function fail(err) {
    if (err) console.error('[coldd] Failed to load live product catalog, falling back to empty:', err);
    window.__CATALOG = [];
    window.__REVIEWS = [];
    window.__POSTS = []; window.__TUTORIALS = []; window.__RELEASES = [];
    window.__ACTIVE_SALE = null;
    loadDependents();
  }

  if (!window.coldSupabase) { fail(); return; }

  // blog.js (Blog/Tutorials/Releases pages) is the only consumer of
  // post/tutorial/release content - skip that part of the query on pages
  // that don't load it. The sale-event announcement bar is sitewide, so
  // it's always fetched.
  var dataThenAttr = (thisScript && thisScript.getAttribute('data-then')) || '';
  var needsContent = dataThenAttr.indexOf('blog.js') >= 0;
  var contentTypes = needsContent ? ['post', 'tutorial', 'release', 'sale_event'] : ['sale_event'];
  var contentQuery = window.coldSupabase.from('content').select('*').in('type', contentTypes).eq('visible', true).order('created_at', { ascending: false }).limit(20000);

  Promise.all([
    window.coldSupabase.from('products').select('*').eq('is_active', true).limit(20000),
    window.coldSupabase
      .from('reviews')
      .select('id, stars, text, created_at, reply, reply_at, user_name, products!inner(slug)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20000),
    contentQuery
  ])
    .then(function (results) {
      var prodRes = results[0], revRes = results[1], contentRes = results[2];
      if (prodRes.error) { fail(prodRes.error); return; }
      window.__CATALOG = (prodRes.data || []).map(toCard);
      if (revRes.error) { console.error('[coldd] Failed to load reviews:', revRes.error); window.__REVIEWS = []; }
      else window.__REVIEWS = (revRes.data || []).map(toReview);
      if (contentRes.error) {
        console.error('[coldd] Failed to load content:', contentRes.error);
        window.__POSTS = []; window.__TUTORIALS = []; window.__RELEASES = []; window.__ACTIVE_SALE = null;
      } else {
        var rows = (contentRes.data || []).map(toContentEntry);
        function byType(t) { return rows.filter(function (r) { return r.__type === t; }); }
        window.__POSTS = byType('post');
        window.__TUTORIALS = byType('tutorial');
        window.__RELEASES = byType('release');
        window.__ACTIVE_SALE = pickActiveSale(byType('sale_event'));
      }
      loadDependents();
    })
    .catch(fail);
})();
