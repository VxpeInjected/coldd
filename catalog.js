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
        if (window.coldSupabase) {
          window.coldSupabase.functions.invoke('track-pageview', { body: { sessionId: sid, path: location.pathname } }).catch(function () {});
        }
      } catch (e) {}
    }
    send();
    // Accepting from the banner counts the page it was accepted on, rather
    // than silently starting from the next navigation.
    window.addEventListener('coldd:consent', send);
  })();

  window.__CATEGORIES = [{"label": "Resell License", "slug": "resell", "platform": "Roblox", "page": "/assets"}, {"label": "Finished Games & Templates", "slug": "game-templates", "platform": "Roblox", "page": "/assets"}, {"label": "Maps", "slug": "maps", "platform": "Roblox", "page": "/assets"}, {"label": "Scripts & UI", "slug": "scripts-ui", "platform": "Roblox", "page": "/assets"}, {"label": "Graphics", "slug": "graphics", "platform": "Roblox", "page": "/assets"}, {"label": "Buildings", "slug": "buildings", "platform": "Roblox", "page": "/assets"}, {"label": "Assets", "slug": "assets", "platform": "Roblox", "page": "/assets"}, {"label": "Uniforms & Gear", "slug": "uniforms-gear", "platform": "Roblox", "page": "/assets"}, {"label": "Boats", "slug": "boats", "platform": "Roblox", "page": "/assets"}, {"label": "Weapons", "slug": "weapons", "platform": "Roblox", "page": "/assets"}, {"label": "Vehicles", "slug": "vehicles", "platform": "Roblox", "page": "/assets"}, {"label": "Animations & VFX", "slug": "animations-vfx", "platform": "Roblox", "page": "/assets"}, {"label": "Hubs", "slug": "hubs", "platform": "Minecraft", "page": "/minecraft"}, {"label": "Lobbies", "slug": "lobbies", "platform": "Minecraft", "page": "/minecraft"}, {"label": "Maps", "slug": "maps", "platform": "Minecraft", "page": "/minecraft"}, {"label": "Builds", "slug": "builds", "platform": "Minecraft", "page": "/minecraft"}, {"label": "Plugins", "slug": "plugins", "platform": "Minecraft", "page": "/minecraft"}, {"label": "Full Setups", "slug": "setups", "platform": "Minecraft", "page": "/minecraft"}];

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
