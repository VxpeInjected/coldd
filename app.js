    // Google Material Symbols (Outlined, 24dp) shipped as inline SVG geometry
    // rather than the icon webfont. The font renders icons as ligature TEXT,
    // which DESIGN.md's "draw every icon" rule exists specifically to prevent -
    // and it would add a render-blocking external request that fails closed to
    // visible glyph names. Paths are lifted verbatim from Google's own SVGs, so
    // the 0 -960 960 960 viewBox is theirs, not a mistake.
    window.MSYM = {
      visibility: 'M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z',
      download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
      reviews: 'm363-390 117-71 117 71-31-133 104-90-137-11-53-126-53 126-137 11 104 90-31 133ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z'
    };
    // Decorative by default: these sit beside a text label, so announcing them
    // would just double-read the button.
    window.msym = function (name, size) {
      var d = window.MSYM[name];
      if (!d) return '';
      var s = size || 16;
      return '<svg class="msym" viewBox="0 -960 960 960" width="' + s + '" height="' + s +
        '" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
    };

    (function () {
      // Shared "which products does the signed-in user own" cache - both
      // the product page and the shop/catalog grid need this, so it's
      // loaded once here instead of each page querying Supabase itself.
      var cache = null, pending = null;
      function load() {
        if (cache) return Promise.resolve(cache);
        if (pending) return pending;
        if (!window.coldSupabase) return Promise.resolve({});
        pending = window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data && res.data.session;
          if (!session) { cache = {}; return cache; }
          return window.coldSupabase
            .from('orders')
            .select('status, order_items(product_slug)')
            .eq('user_id', session.user.id)
            .eq('status', 'paid')
            .then(function (r) {
              var slugs = {};
              ((r && r.data) || []).forEach(function (o) {
                (o.order_items || []).forEach(function (i) { slugs[i.product_slug] = true; });
              });
              cache = slugs;
              return cache;
            });
        });
        return pending;
      }
      window.__coldOwned = {
        load: load,
        has: function (slug) { return !!(cache && cache[slug]); },
        ready: function () { return !!cache; }
      };
    })();

    (function () {
      // Best-effort mirror of a wishlist add/remove into wishlist_items, so
      // it's visible to anything running outside the buyer's own browser
      // (a sale-price update deciding who to notify, say) - localStorage
      // stays the instant-read source of truth the UI itself uses, this is
      // purely a write-behind copy. Silently no-ops signed out, since
      // there's no user_id to attach it to and the wishlist already works
      // fine locally without an account.
      window.__wishSync = function (slug, added) {
        if (!window.coldSupabase) return;
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data && res.data.session;
          if (!session) return;
          return window.coldSupabase.from('products').select('id').eq('slug', slug).maybeSingle().then(function (r) {
            var productId = r && r.data && r.data.id;
            if (!productId) return;
            if (added) {
              return window.coldSupabase.from('wishlist_items').upsert({ user_id: session.user.id, product_id: productId }, { onConflict: 'user_id,product_id' });
            }
            return window.coldSupabase.from('wishlist_items').delete().eq('user_id', session.user.id).eq('product_id', productId);
          });
        }).catch(function () {});
      };
    })();

    // Light mode toggle (dashboard > Appearance). The actual theme
    // application happens in an early inline <head> script on every page
    // (reads localStorage before paint, sets data-theme on <html>) so there
    // is no flash of the wrong theme on pages other than dashboard; this
    // block only has to sync the checkbox and handle live changes.
    (function () {
      var KEY = 'coldd_theme';
      var toggle = document.getElementById('themeLightToggle');
      if (!toggle) return;
      toggle.checked = document.documentElement.getAttribute('data-theme') === 'light';
      toggle.addEventListener('change', function () {
        if (toggle.checked) {
          document.documentElement.setAttribute('data-theme', 'light');
          try { localStorage.setItem(KEY, 'light'); } catch (e) {}
        } else {
          document.documentElement.removeAttribute('data-theme');
          try { localStorage.removeItem(KEY); } catch (e) {}
        }
      });
    })();

    // Back to top - mobile only (see .back-to-top's max-width:1100px gate in
    // styles.css, matching the site's nav breakpoint). Desktop pages are
    // short enough with a persistent floating nav that this is redundant
    // there; on mobile the nav collapses into a hamburger with no equivalent
    // quick return-to-top path.
    (function () {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'back-to-top';
      btn.setAttribute('aria-label', 'Back to top');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      document.body.appendChild(btn);

      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var visible = false;
      function onScroll() {
        var show = window.scrollY > 600;
        if (show === visible) return;
        visible = show;
        btn.classList.toggle('show', show);
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    })();

    // Currency conversion (window.__money/__usd/__robux/__fiat/__currencyMode,
    // the #curSwitch dropdown) moved to catalog.js. It used to live here, but
    // app.js only loads once catalog.js's Supabase fetch resolves (see
    // catalog.js's loadDependents/data-then), which is a couple seconds on a
    // cold load - every price on the page painted in USD from the static
    // markup and then visibly snapped to the visitor's real stored currency
    // once this file finally showed up. catalog.js runs synchronously as
    // soon as its <script> tag is reached, before that fetch resolves, so
    // moving the conversion there makes the first paint already correct.

    (function () {
      const bar = document.getElementById('announce');
      if (!bar) return;
      var DISMISS_KEY = 'coldd_ann_dismissed';
      function hide() { document.documentElement.setAttribute('data-ann', 'off'); window.dispatchEvent(new Event('resize')); }
      const x = document.getElementById('announceX');
      // This is a static multi-page site, not an SPA - every click to a
      // different page re-runs this whole script from scratch, so without
      // remembering the dismissal a visitor had to close the same banner
      // again on every single page they visited ("why does this keep
      // coming back"). sessionStorage (not a cookie or localStorage) keyed
      // on the specific sale's id: it survives normal browsing but clears
      // when the tab closes, and a NEW sale event still gets shown once
      // even if an old one was dismissed earlier.
      if (x) x.addEventListener('click', function () {
        var sale = window.__ACTIVE_SALE;
        if (sale && sale.id) { try { sessionStorage.setItem(DISMISS_KEY, sale.id); } catch (e) {} }
        hide();
      });

      // Starts hidden (see the <html> tag - data-ann has no "on" baked in
      // by default anymore) so there's nothing to flash. This branch is the
      // only thing that ever turns it on, and only once a real active sale
      // is confirmed - previously the static markup shipped a hardcoded
      // "on" state plus placeholder promo copy, which meant every visitor
      // saw stale/wrong text for one frame before this code caught up and
      // hid it again.
      const sale = window.__ACTIVE_SALE;
      if (!sale) { hide(); return; }
      var dismissed = null;
      try { dismissed = sessionStorage.getItem(DISMISS_KEY); } catch (e) {}
      if (sale.id && dismissed === sale.id) { hide(); return; }
      const msg = bar.querySelector('.announce-msg');
      if (msg) {
        const link = msg.querySelector('.announce-link');
        const linkHtml = link ? link.outerHTML : '';
        const escText = String(sale.message || sale.title || '').replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
        msg.innerHTML = escText + ' ' + linkHtml;
      }
      document.documentElement.setAttribute('data-ann', 'on');
      window.dispatchEvent(new Event('resize'));
    })();

    const nav = document.getElementById('nav');
    const backdrop = document.querySelector('.backdrop');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let winH = window.innerHeight;
    function measure() { winH = window.innerHeight; render(); }
    let ticking = false;
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(render); } }
    function render() {
      ticking = false;
      nav.classList.toggle('scrolled', window.scrollY > 12);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    measure();

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll('.reveal');
    // This only ever ran once, over whatever .reveal elements existed at the
    // moment app.js executed. Pages whose content loads after app.js (e.g.
    // reviews-page.js, chained behind app.js in catalog.js's data-then so
    // the review count is known first) inject .reveal cards that never got
    // observed - html.js .reveal defaults to opacity:0 until the observer
    // adds .in, so those cards sat fully rendered in the DOM but invisible,
    // forever. Exposed so any script rendering .reveal content after load
    // can register it - reviews-page.js calls this once after its render().
    window.__scanReveal = function (root) {
      var scope = root || document;
      var found = scope.querySelectorAll('.reveal');
      if (reduce || !('IntersectionObserver' in window)) {
        found.forEach(e => e.classList.add('in'));
      } else if (window.__revealIo) {
        found.forEach(e => window.__revealIo.observe(e));
      }
    };
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
    } else {
      const io = new IntersectionObserver((en) => en.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      window.__revealIo = io;
      els.forEach(e => io.observe(e));
    }

    (function () {
      var nums = document.querySelectorAll('.as-num[data-count]');
      if (!nums.length) return;
      function paint(el, val) {
        var n = Math.round(val);
        var text = el.hasAttribute('data-plain') ? String(n) : n.toLocaleString('en-US');
        el.textContent = text + (el.getAttribute('data-suffix') || '');
      }
      function run(el) {
        var target = parseFloat(el.getAttribute('data-count')) || 0;
        if (reduce) { paint(el, target); return; }
        var start = null, dur = 1300;
        function tick(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          paint(el, target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
      if (!('IntersectionObserver' in window)) {
        nums.forEach(function (el) { paint(el, parseFloat(el.getAttribute('data-count')) || 0); });
      } else {
        var io2 = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { run(e.target); io2.unobserve(e.target); }
          });
        }, { threshold: 0.5 });
        nums.forEach(function (el) { io2.observe(el); });
      }
    })();

    (function () {
      const wrap = document.getElementById('heroStats');
      if (!wrap) return;
      const nums = Array.prototype.slice.call(wrap.querySelectorAll('.hn[data-target]'));
      if (!nums.length) return;

      // Products: real, exact catalog count (both platforms).
      const productsEl = document.getElementById('heroStatProducts');
      if (productsEl) {
        const count = (window.__CATALOG || []).length;
        if (count > 0) {
          productsEl.setAttribute('data-target', count);
          productsEl.setAttribute('data-suffix', '');
        }
      }

      // Discord: the real, live (unrounded) member count - proxied through
      // our own function since Discord's API doesn't send CORS headers for
      // direct browser fetches (same reason admin-discord-stats exists).
      // Waited on below so the animation always plays with the real number
      // instead of the static fallback baked into the HTML.
      const discordEl = document.getElementById('heroStatDiscord');
      const discordReady = (discordEl && window.coldSupabase)
        ? window.coldSupabase.functions.invoke('public-site-stats', { body: {} }).then(function (res) {
            var count = res && res.data && res.data.discordMemberCount;
            if (typeof count === 'number') {
              discordEl.setAttribute('data-target', count);
              discordEl.setAttribute('data-suffix', '');
            }
          }).catch(function () {})
        : Promise.resolve();

      function setFinal(el) {
        var target = Number(el.getAttribute('data-target')) || 0;
        el.textContent = target.toLocaleString('en-US') + (el.getAttribute('data-suffix') || '');
      }

      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Count-up runs on the REAL resolved figure, never on the static fallback
      // baked into the markup - otherwise the number visibly climbs to 850 and
      // then snaps to the true catalog count, which reads as broken. The
      // tabular-nums lock in CSS keeps the digits from reflowing mid-count.
      function countUp(el) {
        var target = Number(el.getAttribute('data-target')) || 0;
        var suffix = el.getAttribute('data-suffix') || '';
        if (reduced || target <= 0) { setFinal(el); return; }

        // Longer for bigger numbers, but bounded - a visitor should never wait
        // on a decoration to read a figure they came for.
        var dur = Math.min(1600, 700 + Math.log10(Math.max(target, 10)) * 260);
        var start = 0;

        function frame(now) {
          if (!start) start = now;
          var t = Math.min((now - start) / dur, 1);
          // easeOutExpo: fast out of the gate, long settle. Reads as an odometer
          // landing rather than a linear tick.
          var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          el.textContent = Math.round(target * eased).toLocaleString('en-US') + suffix;
          if (t < 1) requestAnimationFrame(frame);
          else setFinal(el);
        }
        requestAnimationFrame(frame);
      }

      // Only animate once, and only while the stats are actually on screen -
      // counting up in a scrolled-past viewport is motion nobody sees.
      var played = false;
      function play() {
        if (played) return;
        played = true;
        discordReady.then(function () { nums.forEach(countUp); });
      }

      if (!('IntersectionObserver' in window)) { play(); return; }
      var statIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { play(); statIo.disconnect(); }
        });
      }, { threshold: 0.4 });
      statIo.observe(wrap);

      // Truth outranks the animation. The markup ships a static fallback (850
      // products) that the live catalog count replaces, so if the observer
      // never fires - zero-height viewport, a browser that reports no
      // intersection, the section never scrolled to - the visitor would be
      // left reading a stale, wrong number indefinitely. Print the real
      // figures regardless once they resolve; if the count-up has already
      // started this is a no-op, since play() is latched.
      discordReady.then(function () {
        setTimeout(function () {
          if (played) return;
          played = true;
          nums.forEach(setFinal);
        }, 1200);
      });
    })();

    (function () {
      const track = document.getElementById('nrTrack');
      if (!track) return;
      const dotsWrap = document.getElementById('nrDots');

      // The section ships with static placeholder slides. Replace them with
      // the actual newest live products (by real created_at) once the
      // Supabase-backed catalog has loaded.
      const newest = (window.__CATALOG || []).slice().sort(function (a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }).slice(0, 6);
      if (newest.length) {
        function escNr(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        track.innerHTML = newest.map(function (p) {
          // The image lives on its own .nr-bg layer so the drift animation can
          // scale the photograph without dragging the caption and button with
          // it. The static placeholder slides in the markup keep their inline
          // background on .nr-slide, which still renders if the catalog fetch
          // never resolves.
          return '<div class="nr-slide"><span class="nr-bg" style="background-image:url(\'' + p.image + '\')"></span><div class="nr-cap"><span class="nr-chip">New</span><span class="nr-title">' + escNr(p.title) + '</span><a class="btn nr-view" href="/product?id=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener">View product</a></div></div>';
        }).join('');
        if (dotsWrap) dotsWrap.innerHTML = newest.map(function () { return '<span class="nr-dot"></span>'; }).join('');
      }

      const slides = track.children.length;
      if (slides <= 1) { var sec = track.closest('section'); if (sec) sec.hidden = true; return; }
      const dots = Array.prototype.slice.call(document.querySelectorAll('#nrDots .nr-dot'));
      const DELAY = 3500;
      // Reduced-motion users still get auto-advance (WCAG-friendly cadence, no forced motion
      // to opt into); the CSS's own reduced-motion rule already strips the slide transition,
      // so this just becomes an instant cut instead of a smooth slide.
      let i = 0, timer = null;
      const slideEls = Array.prototype.slice.call(track.children);
      function go(n) {
        i = (n % slides + slides) % slides;
        track.style.transform = 'translateX(' + (-i * 100) + '%)';
        dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
        // Drives the drift + caption stagger in CSS. The class is removed and
        // re-added rather than left on, so returning to a slide replays its
        // entrance instead of showing an already-finished animation.
        slideEls.forEach(function (s, idx) {
          if (idx === i) {
            s.classList.remove('is-active');
            // Reading offsetWidth forces a style flush between the remove and
            // the add; without it the browser coalesces both into one frame and
            // the animation never restarts.
            void s.offsetWidth;
            s.classList.add('is-active');
          } else {
            s.classList.remove('is-active');
          }
        });
      }
      function start() { if (!timer) timer = setInterval(function () { go(i + 1); }, DELAY); }
      function stop() { clearInterval(timer); timer = null; }
      go(0);

      dots.forEach(function (d, idx) {
        d.style.cursor = 'pointer';
        d.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        d.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          go(idx); stop(); start();
        });
      });

      start();
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

      // Without this, the slide can auto-advance out from under the cursor
      // between the user reading a slide and clicking it, sending them to
      // whatever product rotated in next instead of the one they saw.
      var frame = track.closest('.nr-frame') || track;
      frame.addEventListener('mouseenter', stop);
      frame.addEventListener('mouseleave', start);
      frame.addEventListener('focusin', stop);
      frame.addEventListener('focusout', start);
    })();

    const tpanels = document.querySelectorAll('.tpanel');
    const teamGrid = document.querySelector('.team');
    tpanels.forEach(pn => pn.addEventListener('mouseenter', () => {
      tpanels.forEach(x => x.classList.remove('active'));
      pn.classList.add('active');
    }));
    if (teamGrid) teamGrid.addEventListener('mouseleave', () => {
      tpanels.forEach(x => x.classList.remove('active'));
    });

    (function () {
      const links = document.querySelector('.nav-links');
      const navSet = document.querySelector('.nav-set');
      const btn = document.getElementById('searchBtn');
      const input = document.getElementById('searchInput');
      const nav = document.getElementById('nav');
      const panel = document.getElementById('searchPanel');
      const list = document.getElementById('searchList');
      if (!links || !navSet || !btn || !input) return;
      function isOpen() { return links.classList.contains('searching'); }
      function open() {
        if (isOpen()) return;
        navSet.style.maxWidth = navSet.scrollWidth + 'px';
        navSet.getBoundingClientRect();
        links.classList.add('searching');
        navSet.style.maxWidth = '0px';
        setTimeout(function () { input.focus(); }, 60);
      }
      function close() {
        if (!isOpen()) return;
        links.classList.remove('searching');
        navSet.style.maxWidth = navSet.scrollWidth + 'px';
        setTimeout(function () { navSet.style.maxWidth = 'none'; }, 600);
        input.value = ''; input.blur();
        hidePanel();
      }

      function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
      function priceStr(p) {
        var usd = parseFloat(String(p).replace(/[^0-9.]/g, '')) || 0;
        return window.__money ? window.__money(usd) : ('$' + usd);
      }
      function highlight(text, q) {
        const i = text.toLowerCase().indexOf(q);
        if (i < 0) return esc(text);
        return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + q.length)) + '</b>' + esc(text.slice(i + q.length));
      }
      function positionPanel() {
        if (!panel || !nav) return;
        const r = nav.getBoundingClientRect();
        panel.style.top = (r.bottom + 12) + 'px';
      }
      function hidePanel() { if (panel) panel.classList.remove('open'); }
      function showPanel() { if (panel) { positionPanel(); panel.classList.add('open'); } }

      const PAGES = [
        { label: 'Home', href: '/' },
        { label: 'Roblox', href: '/assets' },
        { label: 'Minecraft', href: '/minecraft' },
        { label: 'About Us', href: '/about' }
      ];
      function groupHeader(label) {
        const h = document.createElement('div'); h.className = 'search-group'; h.textContent = label;
        return h;
      }
      function pageRow(href, label, q) {
        const a = document.createElement('a');
        a.className = 'sresult sresult-cat';
        a.href = href;
        a.innerHTML =
          '<span class="sresult-cicon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16"/><path d="M9 9v11"/></svg></span>' +
          '<span class="sresult-info"><span class="sresult-title">' + highlight(label, q) + '</span></span>' +
          '<span class="sresult-go">→</span>';
        a.addEventListener('mousedown', function (e) { e.preventDefault(); });
        a.addEventListener('click', function () { close(); });
        return a;
      }
      function runSearch() {
        if (!panel || !list) return;
        const q = input.value.trim().toLowerCase();
        if (!q) { hidePanel(); return; }

        const pages = PAGES.filter(function (pg) { return pg.label.toLowerCase().indexOf(q) >= 0; });
        const cats = (window.__CATEGORIES || []).filter(function (c) {
          return c.label.toLowerCase().indexOf(q) >= 0;
        }).slice(0, 5);
        const assets = (window.__CATALOG || []).filter(function (p) {
          return p.title.toLowerCase().indexOf(q) >= 0;
        }).slice(0, 8);

        list.innerHTML = '';
        if (!pages.length && !cats.length && !assets.length) {
          list.innerHTML = '<div class="search-empty">No matches for <b>' + esc(input.value.trim()) + '</b></div>';
          showPanel(); return;
        }

        if (pages.length) {
          list.appendChild(groupHeader('Pages'));
          pages.forEach(function (pg) { list.appendChild(pageRow(pg.href, pg.label, q)); });
        }

        if (cats.length) {
          list.appendChild(groupHeader('Categories'));
          cats.forEach(function (c) {
            const a = document.createElement('a');
            a.className = 'sresult sresult-cat';
            a.href = c.page + '?cat=' + c.slug;
            a.innerHTML =
              '<span class="sresult-cicon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span>' +
              '<span class="sresult-info"><span class="sresult-title">' + highlight(c.label, q) + '</span></span>' +
              '<span class="sresult-go">→</span>';
            a.addEventListener('mousedown', function (e) { e.preventDefault(); });
            a.addEventListener('click', function () { close(); });
            list.appendChild(a);
          });
        }

        if (assets.length) {
          list.appendChild(groupHeader('Assets'));
          assets.forEach(function (p) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'sresult';
            b.innerHTML =
              '<span class="sresult-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
              '<span class="sresult-info"><span class="sresult-title">' + highlight(p.title, q) + '</span></span>' +
              '<span class="sresult-price">' + esc(priceStr(p.price)) + '</span>';
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () {
              // Opens the real product page in a new tab, matching what a
              // catalog card already does. This was the last caller of the
              // retired quick-view modal, which is why that panel could still
              // appear from search long after it was removed everywhere else.
              var a = document.createElement('a');
              a.href = '/product?id=' + encodeURIComponent(p.id);
              a.target = '_blank'; a.rel = 'noopener';
              a.click();
              close();
            });
            list.appendChild(b);
          });
        }
        showPanel();
      }

      btn.addEventListener('mousedown', function (e) { if (isOpen()) e.preventDefault(); });
      btn.addEventListener('click', function (e) { e.preventDefault(); isOpen() ? close() : open(); });
      input.addEventListener('input', runSearch);
      input.addEventListener('focus', function () { if (input.value.trim()) runSearch(); });
      input.addEventListener('blur', function () { setTimeout(function () { if (isOpen()) close(); }, 120); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = list && list.querySelector('.sresult');
          if (first) first.click();
        }
      });
      window.addEventListener('resize', function () { if (panel && panel.classList.contains('open')) positionPanel(); });
      window.addEventListener('scroll', function () { if (panel && panel.classList.contains('open')) positionPanel(); }, { passive: true });
      window.addEventListener('currencychange', function () { if (panel && panel.classList.contains('open')) runSearch(); });
    })();

    (function () {
      // .menu-btn is the hamburger shown <=900px (see styles.css) once
      // .nav-links itself is hidden - it previously had no click handler
      // anywhere in the codebase, so there was no way to reach Home/Shop/
      // Blog/About from the header on mobile at all. Reuses .nav-links
      // (search bar included) as a full-screen overlay instead of building
      // separate markup.
      const menuBtn = document.querySelector('.menu-btn');
      const links = document.querySelector('.nav-links');
      if (!menuBtn || !links) return;
      const OPEN_ICON = menuBtn.innerHTML;
      const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      function isMenuOpen() { return links.classList.contains('mobile-open'); }

      // The currency switcher is hidden from .tc below 900px: the nav pill and
      // .tc cannot both fit a full control set at 375px, and currency is the
      // low-frequency one. Move (not clone, so its listeners survive) the live
      // node into the menu panel while open, and put it back on close.
      const curSwitch = document.getElementById('curSwitch');
      const curHome = curSwitch && curSwitch.parentElement;
      function stowCurrency() {
        if (curSwitch && curHome && curSwitch.parentElement !== curHome) curHome.appendChild(curSwitch);
      }
      function lendCurrency() {
        if (curSwitch && curSwitch.parentElement !== links) links.appendChild(curSwitch);
      }

      function closeMenu() {
        if (!isMenuOpen()) return;
        links.classList.remove('mobile-open');
        menuBtn.innerHTML = OPEN_ICON;
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'Menu');
        document.body.classList.remove('nav-menu-open');
        stowCurrency();
      }
      function openMenu() {
        if (isMenuOpen()) return;
        links.classList.add('mobile-open');
        menuBtn.innerHTML = CLOSE_ICON;
        menuBtn.setAttribute('aria-expanded', 'true');
        menuBtn.setAttribute('aria-label', 'Close menu');
        document.body.classList.add('nav-menu-open');
        lendCurrency();
      }
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.addEventListener('click', function () { isMenuOpen() ? closeMenu() : openMenu(); });
      links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
      // Must match the nav collapse breakpoint in styles.css: past it the
      // links return to the pill and the panel has to give the currency
      // switcher back to .tc.
      window.addEventListener('resize', function () { if (window.innerWidth > 1100) closeMenu(); });
    })();

    (function () {
      const trigger = document.getElementById('shopLink');
      const mega = document.getElementById('navMega');
      if (!trigger || !mega) return;
      let hideT;
      function position() {
        const r = trigger.getBoundingClientRect();
        const w = mega.offsetWidth;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
        mega.style.left = left + 'px';
        mega.style.top = (r.bottom + 12) + 'px';
      }
      // Mobile Safari fires a synthetic mouseenter on the first tap of any
      // element with hover listeners (its long-standing hover-before-click
      // compatibility shim) - so tapping "Shop" inside the mobile hamburger
      // panel opened this fixed, z-index:150 flyout on top of that panel
      // instead of just following the link. The desktop hover flyout has no
      // mobile equivalent (categories there live behind /assets' filter
      // panel instead), so it should never open without a real hover
      // device to begin with.
      function canHover() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      }
      function open() {
        if (!canHover()) return;
        const links = document.querySelector('.nav-links');
        if (links && links.classList.contains('searching')) return;
        clearTimeout(hideT); position(); mega.classList.add('open');
      }
      function close() { hideT = setTimeout(function () { mega.classList.remove('open'); }, 130); }
      trigger.addEventListener('mouseenter', open);
      trigger.addEventListener('mouseleave', close);
      mega.addEventListener('mouseenter', function () { clearTimeout(hideT); });
      mega.addEventListener('mouseleave', close);
      window.addEventListener('resize', function () { if (mega.classList.contains('open')) position(); });

      const tabs = mega.querySelectorAll('.nmt-tab');
      const panels = mega.querySelectorAll('.nav-mega-cats[data-platform-panel]');
      const feature = document.getElementById('navMegaFeature');
      function setPlatform(platform) {
        tabs.forEach(function (t) {
          const active = t.getAttribute('data-platform') === platform;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(function (p) { p.hidden = p.getAttribute('data-platform-panel') !== platform; });
        if (feature) {
          feature.setAttribute('href', feature.getAttribute('data-href-' + platform) || feature.getAttribute('href'));
          const img = feature.querySelector('.nmf-img');
          const url = feature.getAttribute('data-img-' + platform);
          if (img && url) img.style.backgroundImage = "url('" + url + "')";
        }
        if (mega.classList.contains('open')) position();
      }
      // Click only, not hover - a hover-triggered switch meant just passing
      // the mouse over "Minecraft" on the way to a Roblox category silently
      // swapped the whole panel out from under the cursor.
      tabs.forEach(function (t) {
        t.addEventListener('click', function () { setPlatform(t.getAttribute('data-platform')); });
      });
    })();

    (function () {
      const wrap = document.getElementById('platSelect');
      const btn = document.getElementById('platBtn');
      const menu = document.getElementById('platMenu');
      if (!wrap || !btn || !menu) return;
      function close() { wrap.classList.remove('open'); menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
      function open() { wrap.classList.add('open'); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
      btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden ? open() : close(); });
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    })();

    // Ratings render from the live catalog only. Product cards used to carry
    // hardcoded stars and counts that no database row backed, so a card
    // advertising "(214)" opened onto a product page reading "Reviews (0)" -
    // and the sort read data-reviews, which those cards never set, so it
    // ranked them as 0 while displaying 214. Shared because the shop grids and
    // the homepage's featured/deals grids both need it.
    var STAR_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M12 2.1l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.16l-5.9 3.11 1.13-6.57L2.45 9.04l6.6-.96z\"/></svg>";
    window.__coldRating = (function () {
      function slugOf(card) {
        var nameEl = card.querySelector('.p-name');
        var t = nameEl ? nameEl.textContent.trim() : '';
        return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }
      function starsHtmlFor(p) {
        if (!(p.reviews > 0)) return '';
        var full = Math.round(p.rating), st = '';
        for (var i = 0; i < 5; i++) st += '<span class="st' + (i < full ? ' on' : '') + '">' + STAR_SVG + '</span>';
        return '<div class="p-stars">' + st + '<span class="p-rc">(' + p.reviews + ')</span></div>';
      }
      function applyRating(card, p) {
        card.setAttribute('data-reviews', p.reviews || 0);
        card.setAttribute('data-rating', p.rating || 0);
        var current = card.querySelector('.p-stars');
        var html = starsHtmlFor(p);
        if (!html) { if (current) current.remove(); return; }
        if (current) { current.outerHTML = html; return; }
        var priceRow = card.querySelector('.p-price-row');
        if (priceRow) priceRow.insertAdjacentHTML('afterend', html);
      }
      return { slugOf: slugOf, starsHtmlFor: starsHtmlFor, applyRating: applyRating };
    })();

    (function () {
      // Featured products and This week's deals used to be hand-written
      // HTML the admin had to edit by hand and keep in sync with real
      // catalog data. Now they're driven by products.featured (admin-set,
      // see the admin panel's product editor) and products.weekly_deal
      // (set automatically by the weekly-deals algorithm, see
      // admin-weekly-deals) - real DB rows replace the static markup
      // below when there are any; the original static cards stay as a
      // no-JS/no-picks-yet fallback rather than leaving the section empty.
      function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function money(n) { return window.__money ? window.__money(n) : ('$' + (n % 1 === 0 ? n : n.toFixed(2))); }
      function homeCardHtml(p) {
        var onSale = p.was > p.priceNum;
        var offPct = onSale ? Math.round((1 - p.priceNum / p.was) * 100) : 0;
        var resell = p.resell ? ' data-resell="yes" data-resell-price="' + (p.resellPrice != null ? p.resellPrice : Math.round(p.priceNum * 3)) + '"' : '';
        // data-usd on both spans (not just the static fmtPriceStr this
        // replaced) so a later currency toggle - catalog.js's applyStatic,
        // which re-queries every .p-price/.p-was in the document - picks
        // these up too. Without it these two grids stayed in USD forever
        // after being replaced, even once the visitor switched currency.
        return '<article class="product" data-id="' + escHtml(p.id) + '" data-cat="' + escHtml(p.cat || '') + '" data-price="' + p.priceNum + '" data-catlabel="' + escHtml(p.cat || '') + '"' + resell + (onSale ? ' data-was="' + p.was + '"' : '') + '>' +
          '<div class="p-thumb" style="background-image:url(\'' + p.image + '\')">' + (onSale ? '<span class="p-off">-' + offPct + '%</span>' : '') + '</div>' +
          '<div class="p-body">' +
            '<h3 class="p-name">' + escHtml(p.title) + '</h3>' +
            '<div class="p-price-row">' + (onSale ? '<span class="p-was" data-usd="' + p.was + '">' + money(p.was) + '</span>' : '') + '<span class="p-price" data-usd="' + p.priceNum + '">' + money(p.priceNum) + '</span></div>' +
            '<p class="p-sum">' + escHtml(p.desc || '') + '</p>' +
            '<div class="p-actions"><button class="p-buy" type="button">Buy now</button><button class="p-add" type="button">Add to cart</button></div>' +
          '</div>' +
        '</article>';
      }
      var catalog = window.__CATALOG || [];
      // Both grids ship `hidden` in the static HTML - see index.html - so the
      // hardcoded example cards below (a fallback for no-JS/no-picks-yet,
      // not real inventory) never get a first paint of their own. Without
      // this, every visitor saw those made-up products and prices flash for
      // however long the catalog fetch above took, then get replaced by
      // whatever's actually true (or removed entirely if there are no
      // picks) - a textbook wrong-then-right flash, not a normal load state.
      var featuredGrid = document.getElementById('homeFeaturedGrid');
      if (featuredGrid) {
        var featuredPicks = catalog.filter(function (p) { return p.featured; }).sort(function (a, b) { return a.featuredOrder - b.featuredOrder; }).slice(0, 4);
        if (featuredPicks.length) featuredGrid.innerHTML = featuredPicks.map(homeCardHtml).join('');
        featuredGrid.hidden = !featuredPicks.length;
      }
      var dealsGrid = document.getElementById('homeDealsGrid');
      if (dealsGrid) {
        var dealPicks = catalog.filter(function (p) { return p.weeklyDeal; }).slice(0, 4);
        if (dealPicks.length) dealsGrid.innerHTML = dealPicks.map(homeCardHtml).join('');
        dealsGrid.hidden = !dealPicks.length;
      }
    })();

    (function () {
      // The homepage's featured/deals cards are static markup outside any
      // .shop, so the shop reconciler below never reached them and they kept
      // whatever rating the HTML hardcoded. The products themselves are real,
      // so match them to the catalog by name and let the live row supply the
      // stars. The static markup stays as the no-JS fallback; it just no
      // longer asserts a review count of its own.
      var cards = document.querySelectorAll('.featured-grid .product');
      if (!cards.length) return;
      var byId = {};
      (window.__CATALOG || []).forEach(function (p) { byId[p.id] = p; });
      Array.prototype.forEach.call(cards, function (card) {
        var p = byId[window.__coldRating.slugOf(card)];
        if (!p) return;
        card.setAttribute('data-id', p.id);
        window.__coldRating.applyRating(card, p);
      });
    })();

    (function () {
      const shops = document.querySelectorAll('.shop');
      if (!shops.length) return;
      shops.forEach(function (shop) {
        const grid = shop.querySelector('.product-grid');
        if (!grid) return;
        const chips = shop.querySelector('.filters');
        const sideCats = shop.querySelector('.fc-cats');
        const searchEl = shop.querySelector('.shop-search');
        const prMin = shop.querySelector('.pr-min');
        const prMax = shop.querySelector('.pr-max');
        const prFill = shop.querySelector('.pr-fill');
        const prMinVal = shop.querySelector('.pr-minval');
        const prMaxVal = shop.querySelector('.pr-maxval');
        const empty = shop.querySelector('.shop-empty');
        const pager = shop.querySelector('.shop-pager');
        const saleBox = shop.querySelector('.fc-sale');
        const freeBox = shop.querySelector('.fc-free');
        const sortField = shop.querySelector('.sort-field');
        const sortBtn = shop.querySelector('.sort-btn');
        const sortMenu = shop.querySelector('.sort-menu');
        const sortBtnVal = shop.querySelector('.sort-btn-val');
        const sortOpts = sortMenu ? Array.prototype.slice.call(sortMenu.querySelectorAll('.sort-opt')) : [];
        const clearBtn = shop.querySelector('.fc-clear');
        const countEl = shop.querySelector('.shop-count');
        const base = shop.getAttribute('data-page') || (location.pathname.split('/').pop() || '/assets');
        // Matches product.html/checkout's fallback when a product has no
        // admin-set resell_price_usd.
        const RESELL_MULT = 3;

        // The grid below ships as static markup (built once from the source
        // HTML), so it doesn't know about products created after the last
        // build. Reconcile it against the live, Supabase-backed catalog:
        // stamp real creation dates onto the cards that are already there
        // (so "Newest"/"Oldest" sort on real dates instead of DOM order),
        // and append any catalog product missing from the static markup.
        (function reconcileGrid() {
          function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
          function fmtPriceStr(n) { return '$' + (n % 1 === 0 ? n : n.toFixed(2)); }
          var shopPlatform = base === '/minecraft' ? 'Minecraft' : 'Roblox';
          var catSlugByLabel = {};
          (window.__CATEGORIES || []).forEach(function (c) { if (c.platform === shopPlatform) catSlugByLabel[c.label] = c.slug; });
          var starsHtmlFor = window.__coldRating.starsHtmlFor;
          var applyRating = window.__coldRating.applyRating;

          var existingByCardId = {};
          Array.prototype.slice.call(grid.querySelectorAll('.product')).forEach(function (el) {
            existingByCardId[window.__coldRating.slugOf(el)] = el;
          });
          (window.__CATALOG || []).filter(function (p) { return p.platform === shopPlatform; }).forEach(function (p) {
            var existing = existingByCardId[p.id];
            if (existing) {
              existing.setAttribute('data-id', p.id);
              existing.setAttribute('data-priority', p.priority ? 'yes' : 'no');
              if (p.createdAt) existing.setAttribute('data-created', p.createdAt);
              if (p.resell) {
                existing.setAttribute('data-resell', 'yes');
                existing.setAttribute('data-resell-price', p.resellPrice != null ? p.resellPrice : Math.round(p.priceNum * RESELL_MULT));
              }
              applyRating(existing, p);
              return;
            }
            var onSale = p.was > p.priceNum;
            var offPct = onSale ? Math.round((1 - p.priceNum / p.was) * 100) : 0;
            var starsHtml = starsHtmlFor(p);
            var art = document.createElement('article');
            art.className = 'product';
            art.setAttribute('data-id', p.id);
            art.setAttribute('data-cat', catSlugByLabel[p.cat] || '');
            art.setAttribute('data-price', p.priceNum);
            art.setAttribute('data-reviews', p.reviews || 0);
            art.setAttribute('data-rating', p.rating || 0);
            art.setAttribute('data-catlabel', p.cat || '');
            art.setAttribute('data-priority', p.priority ? 'yes' : 'no');
            if (p.createdAt) art.setAttribute('data-created', p.createdAt);
            if (p.resell) {
              art.setAttribute('data-resell', 'yes');
              var resellUsd = p.resellPrice != null ? p.resellPrice : Math.round(p.priceNum * RESELL_MULT);
              art.setAttribute('data-resell-price', resellUsd);
            }
            if (p.subcat) art.setAttribute('data-subcat', p.subcat);
            if (onSale) art.setAttribute('data-was', p.was);
            art.innerHTML =
              '<div class="p-thumb" style="background-image:url(\'' + p.image + '\')">' + (onSale ? '<span class="p-off">-' + offPct + '%</span>' : '') + '</div>' +
              '<div class="p-body">' +
                '<h3 class="p-name">' + escHtml(p.title) + '</h3>' +
                '<div class="p-price-row">' + (onSale ? '<span class="p-was">' + fmtPriceStr(p.was) + '</span>' : '') + '<span class="p-price">' + p.price + '</span></div>' +
                starsHtml +
                '<p class="p-sum">' + escHtml(p.desc || '') + '</p>' +
                '<div class="p-actions"><button class="p-buy" type="button">Buy now</button>' +
                '<button class="p-add" type="button">Add to cart</button></div>' +
              '</div>';
            grid.appendChild(art);
          });

          // Catches static cards marked data-resell="yes" in the source HTML
          // with no matching live catalog entry (so the loop above never
          // touched them) - falls back to the same 3x multiplier every other
          // resell price defaults to.
          grid.querySelectorAll('.product[data-resell="yes"]:not([data-resell-price])').forEach(function (el) {
            var base = parseFloat(el.getAttribute('data-price')) || 0;
            el.setAttribute('data-resell-price', Math.round(base * RESELL_MULT));
          });
        })();

        const products = Array.prototype.slice.call(grid.querySelectorAll('.product'));
        const PER_PAGE = 12;
        let page = 1;

        function markOwned() {
          products.forEach(function (card) {
            var owned = window.__coldOwned.has(card.getAttribute('data-id'));
            card.classList.toggle('owned', owned);
            var addBtn = card.querySelector('.p-add');
            if (addBtn) {
              addBtn.disabled = owned;
              addBtn.textContent = owned ? 'Owned' : 'Add to cart';
            }
            var buyBtn = card.querySelector('.p-buy');
            if (buyBtn) buyBtn.disabled = owned;
            var thumb = card.querySelector('.p-thumb');
            var badge = thumb ? thumb.querySelector('.p-owned-badge') : null;
            if (owned && thumb && !badge) thumb.insertAdjacentHTML('beforeend', '<span class="p-owned-badge">Owned</span>');
            else if (!owned && badge) badge.remove();
          });
        }
        window.__coldOwned.load().then(markOwned);

        let maxPrice = 0;
        products.forEach(function (p) { maxPrice = Math.max(maxPrice, parseFloat(p.getAttribute('data-price')) || 0); });
        maxPrice = Math.max(10, Math.ceil(maxPrice / 10) * 10);
        if (prMin && prMax) { prMin.max = prMax.max = maxPrice; prMin.value = 0; prMax.value = maxPrice; }
        if (prMinVal && prMaxVal) { prMinVal.max = prMaxVal.max = maxPrice; prMinVal.value = 0; prMaxVal.value = maxPrice; }
        let curCat = 'all', curSub = null, query = '', lo = 0, hi = maxPrice, onSale = false, onFree = false, sortMode = 'recommended';

        function paintRange() {
          if (prFill) { prFill.style.left = (lo / maxPrice * 100) + '%'; prFill.style.width = ((hi - lo) / maxPrice * 100) + '%'; }
          if (prMinVal && document.activeElement !== prMinVal) prMinVal.value = Math.round(lo);
          if (prMaxVal && document.activeElement !== prMaxVal) prMaxVal.value = Math.round(hi);
        }
        function syncCats() {
          if (chips) chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-cat') === curCat); });
          if (sideCats) {
            sideCats.querySelectorAll('.fc-cat').forEach(function (c) { c.classList.toggle('active', !curSub && c.getAttribute('data-cat') === curCat); });
            sideCats.querySelectorAll('.fc-sub').forEach(function (c) { c.classList.toggle('active', curSub && c.getAttribute('data-cat') === curCat && c.getAttribute('data-subcat') === curSub); });
          }
        }
        function matches(p) {
          const price = parseFloat(p.getAttribute('data-price')) || 0;
          const nameEl = p.querySelector('.p-name') || p.querySelector('h3');
          const title = (nameEl ? nameEl.textContent : '').toLowerCase();
          const okCat = curCat === 'all' ? true
                      : curCat === 'resell' ? p.getAttribute('data-resell') === 'yes'
                      : p.getAttribute('data-cat') === curCat;
          // Resell License is a cross-cutting filter, not a category of its
          // own - a resellable product still lives in Maps or Scripts & UI. So
          // under Resell the sub-buttons ARE the real categories, and curSub
          // matches data-cat rather than data-subcat.
          const okSub = !curSub ? true
                      : curCat === 'resell' ? p.getAttribute('data-cat') === curSub
                      : p.getAttribute('data-subcat') === curSub;
          const okSale = !onSale || p.hasAttribute('data-was');
          const okFree = !onFree || p.getAttribute('data-free') === 'yes';
          return okCat && okSub && okSale && okFree && (!query || title.indexOf(query) >= 0) && price >= lo && price <= hi;
        }
        function isFiltered() {
          return curCat !== 'all' || !!curSub || !!query || lo > 0 || hi < maxPrice || onSale || onFree;
        }

        // Below 1040px .shop-side becomes a sheet (see styles.css) so the grid,
        // not ~1050px of filter UI, is what a phone user lands on. The trigger
        // and the sheet's own controls are built here rather than in the page
        // markup: they only mean anything with scripting, and the CSS that
        // hides the panel is scoped to html.js for the same reason.
        const side = shop.querySelector('.shop-side');
        const resultsBar = shop.querySelector('.shop-resultsbar');
        let filtersBtn = null, filtersN = null, doneBtn = null, scrim = null;

        function sheetActive() { return !!filtersBtn && getComputedStyle(filtersBtn).display !== 'none'; }
        function countActiveFilters() {
          let n = 0;
          if (curCat !== 'all') n++;
          if (curSub) n++;
          if (lo > 0 || hi < maxPrice) n++;
          if (onSale) n++;
          if (onFree) n++;
          return n;
        }
        // main.page carries a transform for the page-transition animation, and
        // a transformed ancestor becomes the containing block for position:
        // fixed descendants - the sheet anchored to the bottom of the document
        // (y=5777) instead of the viewport. Portal it to <body> while it is
        // open and put it back exactly where it was on close, so the desktop
        // layout above 1040px is untouched.
        let sideHome = null, sideNext = null;
        function closeSheet() {
          if (!side || !side.classList.contains('open')) return;
          side.classList.remove('open');
          document.body.classList.remove('shop-filters-open');
          if (scrim) { scrim.remove(); scrim = null; }
          if (sideHome) { sideHome.insertBefore(side, sideNext); sideHome = null; sideNext = null; }
          if (filtersBtn) { filtersBtn.setAttribute('aria-expanded', 'false'); filtersBtn.focus(); }
        }
        function openSheet() {
          if (!side || side.classList.contains('open')) return;
          scrim = document.createElement('div');
          scrim.className = 'shop-filters-scrim';
          scrim.addEventListener('click', closeSheet);
          sideHome = side.parentNode;
          sideNext = side.nextSibling;
          document.body.appendChild(scrim);
          document.body.appendChild(side);
          // Flush the moved node's style at translateY(101%) before adding the
          // class that animates it to 0, or the sheet jumps into place with no
          // transition. A forced reflow rather than rAF, so the sheet still
          // opens when the frame loop is throttled (background tab).
          void side.offsetWidth;
          side.classList.add('open');
          document.body.classList.add('shop-filters-open');
          if (filtersBtn) filtersBtn.setAttribute('aria-expanded', 'true');
          const firstCtl = side.querySelector('button, input, select, a[href]');
          if (firstCtl) firstCtl.focus();
        }
        function syncFilterSheet(matchedCount) {
          if (!filtersBtn) return;
          const n = countActiveFilters();
          filtersN.textContent = n ? String(n) : '';
          filtersBtn.setAttribute('aria-label', n ? 'Filters, ' + n + ' active' : 'Filters');
          if (doneBtn) {
            doneBtn.textContent = matchedCount === 1
              ? 'Show 1 result'
              : 'Show ' + matchedCount + ' results';
          }
          if (!sheetActive()) closeSheet();
        }

        if (side && resultsBar) {
          filtersBtn = document.createElement('button');
          filtersBtn.type = 'button';
          filtersBtn.className = 'shop-filters-btn';
          filtersBtn.setAttribute('aria-expanded', 'false');
          filtersBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><circle cx="12" cy="4" r="2"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><circle cx="10" cy="12" r="2"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="14" cy="20" r="2"/></svg>' +
            '<span>Filters</span><span class="shop-filters-n"></span>';
          filtersN = filtersBtn.querySelector('.shop-filters-n');
          filtersBtn.addEventListener('click', function () {
            side.classList.contains('open') ? closeSheet() : openSheet();
          });
          resultsBar.appendChild(filtersBtn);

          doneBtn = document.createElement('button');
          doneBtn.type = 'button';
          doneBtn.className = 'shop-filters-done';
          doneBtn.textContent = 'Show results';
          doneBtn.addEventListener('click', closeSheet);
          side.appendChild(doneBtn);

          document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
          // Past the breakpoint the panel returns to the flow, so a sheet left
          // open would otherwise strand the scroll lock and scrim behind it.
          window.addEventListener('resize', function () { if (!sheetActive()) closeSheet(); });
        }
        // "Recommended" (the default every visitor lands on, before they've
        // touched the sort menu) used to just return the grid in whatever
        // arbitrary order the DOM happened to have it in - not sorted by
        // anything, just literally not-sorted. This is what most visitors
        // actually see, so it's the highest-leverage place on the whole
        // catalog to rank by something real instead of nothing:
        //   - social proof: rating and review count, log-dampened so one
        //     5-star review doesn't outrank a 4.8 with 200 of them
        //   - sale urgency/value: a real discount is a real reason to buy
        //     now, weighted by how deep it is
        //   - recency: new arrivals get a visibility nudge that decays
        //     over ~2 months, instead of being buried under old bestsellers
        //     forever with no way to ever accumulate reviews of their own
        //   - price, log-dampened same as reviews: between two similarly
        //     well-reviewed products, nudge the higher-value one forward -
        //     revenue per impression matters, but this is deliberately
        //     gentle (a $500 item with no reviews still loses badly to a
        //     $50 item with 200 five-star ones) so it breaks near-ties
        //     toward money without burying quality under price alone
        //   - interest: a signed-in visitor's own purchase history (which
        //     categories they've actually bought from before) boosts
        //     matching products - someone who's bought VFX packs is a
        //     better prospect for another VFX pack than a cold visitor is,
        //     so show it to them first
        // These are all things that plausibly correlate with someone
        // actually completing a purchase, not just similarity to whatever
        // they're currently looking at (that's related()'s job, on the
        // product page).
        var userCategories = null; // Set of "platform|cat", null until the async fetch below resolves (or resolves to signed-out)
        var catalogRevenue = null; // Map slug -> total real revenue, from get_catalog_revenue

        // Replaces a fixed genre-keyword list (which needed a human to
        // notice a new recurring theme in the catalog - "brainrot",
        // whatever comes after it - and go add it by hand) with terms the
        // catalog itself surfaces: catalog_signal_terms() (see
        // 20260819_dynamic_signal_terms.sql) extracts every meaningful
        // word/phrase from each product's title+description and keeps only
        // the ones that recur across a real slice of the catalog - not one
        // product's own flavor text, not near-universal noise like
        // "roblox". That's computed once, server-side, for the whole
        // catalog and fetched here as slug -> terms.
        var catalogTerms = null; // Map slug -> term[], from catalog_signal_terms()
        var userTerms = null; // Set of terms, from get_user_signal_terms

        function conversionScore(el) {
          // Manual admin override (product edit form's "Priority" checkbox) -
          // large enough to reliably clear the real signals below (a
          // realistic ceiling there is roughly rating*2*10 + sale + recency,
          // well under 200), but still just an addend, not a hijack: two
          // priority products still rank against each other and everything
          // else by the real signals underneath it.
          var priorityBoost = el.getAttribute('data-priority') === 'yes' ? 200 : 0;
          var rating = parseFloat(el.getAttribute('data-rating')) || 0;
          var reviews = parseFloat(el.getAttribute('data-reviews')) || 0;
          var price = parseFloat(el.getAttribute('data-price')) || 0;
          var was = parseFloat(el.getAttribute('data-was')) || 0;
          var created = Date.parse(el.getAttribute('data-created')) || 0;

          var social = (rating * 2 + Math.log(1 + reviews)) * 10;

          var saleBoost = 0;
          if (was > price && was > 0) {
            var pct = (1 - price / was) * 100;
            saleBoost = 15 + pct * 0.3;
          }

          var recencyBoost = 0;
          if (created) {
            var daysOld = (Date.now() - created) / 86400000;
            recencyBoost = Math.max(0, 20 - daysOld / 3);
          }

          var priceWeight = Math.log(1 + price) * 4;

          var interestBoost = 0;
          if (userCategories && userCategories.size) {
            // reconcileGrid's own shopPlatform is scoped to its own inner
            // function, not shared with this one - same derivation from
            // the same `base` const, just recomputed here.
            var platform = base === '/minecraft' ? 'Minecraft' : 'Roblox';
            var key = platform + '|' + (el.getAttribute('data-catlabel') || '');
            if (userCategories.has(key)) interestBoost = 25;
          }

          // Genre match: "bought a simulator map" generalizing to "show
          // more simulator products" even across different catalog
          // categories - a coarser category match above already covers
          // "same category", this covers "same kind of game, different
          // category label".
          var genreBoost = 0;
          if (userTerms && userTerms.size && catalogTerms) {
            var terms = catalogTerms[el.getAttribute('data-id')];
            if (terms && terms.some(function (t) { return userTerms.has(t); })) genreBoost = 25;
          }

          // Real revenue this exact product has generated from actual paid
          // orders - not a price guess, what has actually sold. The
          // strongest "will this make money" signal available, so it's
          // weighted heavier than the raw price term above, but still
          // log-dampened for the same reason: one product's entire
          // lifetime revenue shouldn't be able to permanently bury
          // everything else on the page.
          var revenueBoost = 0;
          if (catalogRevenue) {
            var rev = catalogRevenue[el.getAttribute('data-id')] || 0;
            if (rev > 0) revenueBoost = Math.log(1 + rev) * 6;
          }

          // A resell licence is a materially bigger sale than the personal
          // one on the same product - worth a small nudge toward products
          // that actually offer that upsell path at all.
          var resellBoost = el.getAttribute('data-resell') === 'yes' ? 8 : 0;

          return priorityBoost + social + saleBoost + recencyBoost + priceWeight + interestBoost + genreBoost + revenueBoost + resellBoost;
        }
        function loadUserCategories() {
          if (!window.coldSupabase) return;
          window.coldSupabase.auth.getSession().then(function (res) {
            var session = res && res.data && res.data.session;
            if (!session) return;
            return window.coldSupabase.rpc('get_user_categories', { p_user_id: session.user.id }).then(function (r) {
              var rows = r.data || [];
              if (!rows.length) return;
              userCategories = new Set(rows.map(function (row) { return row.platform + '|' + row.cat; }));
              // Interest data landed after the page's first render (it
              // needs a round trip) - reflow the already-visible grid with
              // it now rather than making every visitor wait on this
              // before seeing anything.
              if ((sortMode || 'recommended') === 'recommended') refilter(false);
            });
          }).catch(function () {});
        }
        loadUserCategories();
        function loadCatalogTerms() {
          if (!window.coldSupabase) return;
          window.coldSupabase.rpc('catalog_signal_terms', {}).then(function (r) {
            var rows = r.data || [];
            if (!rows.length) return;
            var map = {};
            rows.forEach(function (row) { map[row.product_slug] = row.terms || []; });
            catalogTerms = map;
            if ((sortMode || 'recommended') === 'recommended') refilter(false);
          }).catch(function () {});
        }
        loadCatalogTerms();
        function loadUserTerms() {
          if (!window.coldSupabase) return;
          window.coldSupabase.auth.getSession().then(function (res) {
            var session = res && res.data && res.data.session;
            if (!session) return;
            return window.coldSupabase.rpc('get_user_signal_terms', { p_user_id: session.user.id }).then(function (r) {
              var terms = r.data || [];
              if (!terms.length) return;
              userTerms = new Set(terms);
              if ((sortMode || 'recommended') === 'recommended') refilter(false);
            });
          }).catch(function () {});
        }
        loadUserTerms();
        function loadCatalogRevenue() {
          if (!window.coldSupabase) return;
          window.coldSupabase.rpc('get_catalog_revenue', {}).then(function (r) {
            var rows = r.data || [];
            if (!rows.length) return;
            var map = {};
            rows.forEach(function (row) { map[row.product_slug] = Number(row.revenue) || 0; });
            catalogRevenue = map;
            if ((sortMode || 'recommended') === 'recommended') refilter(false);
          }).catch(function () {});
        }
        loadCatalogRevenue();
        function sortMatches(arr) {
          const mode = sortMode || 'recommended';
          if (mode === 'recommended') {
            const withScore = arr.map(function (p, i) { return { p: p, i: i, s: conversionScore(p) }; });
            withScore.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
            return withScore.map(function (m) { return m.p; });
          }
          if (mode === 'newest' || mode === 'oldest') {
            const withDate = arr.map(function (p, i) { return { p: p, i: i, t: Date.parse(p.getAttribute('data-created')) || 0 }; });
            withDate.sort(function (a, b) { return mode === 'newest' ? (b.t - a.t) || (a.i - b.i) : (a.t - b.t) || (a.i - b.i); });
            return withDate.map(function (m) { return m.p; });
          }
          const withMeta = arr.map(function (p, i) {
            return {
              p: p, i: i,
              price: parseFloat(p.getAttribute('data-price')) || 0,
              rating: parseFloat(p.getAttribute('data-rating')) || 0,
              reviews: parseFloat(p.getAttribute('data-reviews')) || 0
            };
          });
          withMeta.sort(function (a, b) {
            if (mode === 'price-asc') return (a.price - b.price) || (a.i - b.i);
            if (mode === 'price-desc') return (b.price - a.price) || (a.i - b.i);
            if (mode === 'featured') return (b.rating - a.rating) || (b.reviews - a.reviews) || (a.i - b.i);
            return a.i - b.i;
          });
          return withMeta.map(function (m) { return m.p; });
        }
        function renderPager(pages) {
          if (!pager) return;
          pager.innerHTML = '';
          if (pages <= 1) return;
          function btn(label, target, opts) {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
            if (opts && opts.disabled) b.disabled = true;
            if (opts && opts.active) b.classList.add('active');
            else b.addEventListener('click', function () {
              page = target; refilter(false);
              try { window.scrollTo({ top: Math.max(0, shop.getBoundingClientRect().top + window.scrollY - 90), behavior: 'smooth' }); } catch (_) {}
            });
            return b;
          }
          pager.appendChild(btn('‹', page - 1, { disabled: page === 1 }));
          for (let i = 1; i <= pages; i++) pager.appendChild(btn(String(i), i, { active: i === page }));
          pager.appendChild(btn('›', page + 1, { disabled: page === pages }));
        }
        // The Resell filter shows the same cards as their real category
        // (resell is cross-cutting, not its own set of products - see
        // matches() above), so left alone they'd keep showing the Personal
        // Use price while the shopper is specifically browsing for a resell
        // licence. Swap the visible price for the resell price while that
        // filter is active, and back to normal the moment it isn't.
        // Same real per-product robux_price the cart/checkout and product.html
        // already prefer over the flat 80-per-dollar estimate (see app.js's
        // catalogRobuxPrice, a separate IIFE scope this can't reach directly -
        // this is that same lookup against the same window.__CATALOG global).
        // Without it the shop grid quoted one Robux number while the cart
        // quoted a different, real one for the identical product.
        function cardRobuxPrice(id) {
          var p = (window.__CATALOG || []).filter(function (c) { return c.id === id; })[0];
          // > 0: a stored robux_price of 0 is bad data, not a real R$0
          // price - falls back to the flat estimate instead of quoting
          // a product free in Robux while it still costs real money.
          return p && p.robuxPrice > 0 ? p.robuxPrice : null;
        }
        function syncCardPricing(card) {
          var priceRow = card.querySelector('.p-price-row');
          if (!priceRow) return;
          var resell = card.getAttribute('data-resell') === 'yes';
          var robuxMode = window.__currencyMode ? window.__currencyMode() === 'robux' : false;
          if (curCat === 'resell' && resell) {
            var resellUsd = Number(card.getAttribute('data-resell-price'));
            // Resell licences aren't sold in Robux at all (matches product.html
            // and the cart), so this stays USD even in Robux mode.
            var text = robuxMode
              ? (window.__usd ? window.__usd(resellUsd) : ('$' + resellUsd))
              : (window.__money ? window.__money(resellUsd) : ('$' + resellUsd));
            // No "was" price for resell - it isn't a sale off a base price,
            // it's a different licence with its own price.
            priceRow.innerHTML = '<span class="p-price" data-usd="' + resellUsd + '">' + text + '</span>';
          } else {
            var was = card.getAttribute('data-was');
            var baseUsd = Number(card.getAttribute('data-price'));
            var rbx = robuxMode ? cardRobuxPrice(card.getAttribute('data-id')) : null;
            var baseText = rbx != null ? ('R$ ' + Math.round(rbx).toLocaleString('en-US')) : (window.__money ? window.__money(baseUsd) : ('$' + baseUsd));
            priceRow.innerHTML = (was ? '<span class="p-was">' + (window.__money ? window.__money(Number(was)) : ('$' + was)) + '</span>' : '') + '<span class="p-price" data-usd="' + baseUsd + '">' + baseText + '</span>';
          }
        }
        function refilter(resetPage) {
          if (resetPage) page = 1;
          const matched = sortMatches(products.filter(matches));
          const pages = Math.max(1, Math.ceil(matched.length / PER_PAGE));
          if (page > pages) page = pages;
          const start = (page - 1) * PER_PAGE;
          const visible = matched.slice(start, start + PER_PAGE);
          products.forEach(function (p) { p.style.display = 'none'; });
          visible.forEach(function (p) { p.style.display = ''; grid.appendChild(p); syncCardPricing(p); });
          if (empty) empty.hidden = matched.length > 0;
          renderPager(pages);
          if (countEl) {
            countEl.textContent = matched.length === products.length
              ? matched.length + (matched.length === 1 ? ' result' : ' results')
              : 'Showing ' + matched.length + ' of ' + products.length + ' results';
          }
          if (clearBtn) clearBtn.hidden = !isFiltered();
          syncFilterSheet(matched.length);
        }
        function setCat(cat) { curCat = cat; curSub = null; syncCats(); refilter(true); }
        function setSub(cat, sub) { curCat = cat; curSub = sub; syncCats(); refilter(true); }
        shop.__applyCat = setCat;

        if (chips) chips.addEventListener('click', function (e) {
          const c = e.target.closest('.chip'); if (!c) return;
          setCat(c.getAttribute('data-cat'));
          try { history.replaceState(null, '', curCat === 'all' ? base : (base + '?cat=' + curCat)); } catch (_) {}
        });
        // The subcategory lists open via grid-template-rows: 0fr -> 1fr, which
        // needs every item inside one grid row. Wrapping here rather than in
        // the page markup keeps the two shop pages from having to repeat it
        // around 11 groups each.
        if (sideCats) sideCats.querySelectorAll('.fc-subs').forEach(function (subs) {
          if (subs.querySelector(':scope > .fc-subs-inner')) return;
          const inner = document.createElement('div');
          inner.className = 'fc-subs-inner';
          while (subs.firstChild) inner.appendChild(subs.firstChild);
          subs.appendChild(inner);
        });
        if (sideCats) sideCats.addEventListener('click', function (e) {
          const sub = e.target.closest('.fc-sub');
          if (sub) { setSub(sub.getAttribute('data-cat'), sub.getAttribute('data-subcat')); return; }
          const c = e.target.closest('.fc-cat'); if (!c) return;
          const group = c.closest('.fc-cat-group');
          sideCats.querySelectorAll('.fc-cat-group.open').forEach(function (g) {
            if (g !== group) { g.classList.remove('open'); var s = g.querySelector('.fc-subs'); if (s) s.hidden = true; }
          });
          if (group) {
            const willOpen = !group.classList.contains('open');
            group.classList.toggle('open', willOpen);
            const subs = group.querySelector('.fc-subs'); if (subs) subs.hidden = !willOpen;
          }
          setCat(c.getAttribute('data-cat'));
        });
        if (searchEl) searchEl.addEventListener('input', function () { query = searchEl.value.trim().toLowerCase(); refilter(true); });
        function onRange() {
          lo = Math.min(+prMin.value, +prMax.value);
          hi = Math.max(+prMin.value, +prMax.value);
          paintRange(); refilter(true);
        }
        if (prMin && prMax) { prMin.addEventListener('input', onRange); prMax.addEventListener('input', onRange); }
        function onPriceBox() {
          let a = parseFloat(prMinVal.value); let b = parseFloat(prMaxVal.value);
          if (isNaN(a)) a = 0;
          if (isNaN(b)) b = maxPrice;
          a = Math.max(0, Math.min(a, maxPrice));
          b = Math.max(0, Math.min(b, maxPrice));
          lo = Math.min(a, b); hi = Math.max(a, b);
          if (prMin && prMax) { prMin.value = lo; prMax.value = hi; }
          paintRange(); refilter(true);
        }
        if (prMinVal && prMaxVal) {
          prMinVal.addEventListener('change', onPriceBox);
          prMaxVal.addEventListener('change', onPriceBox);
          [prMinVal, prMaxVal].forEach(function (el) {
            el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
          });
        }
        // The global currency toggle's own handler (apply(), in the
        // currency-switch module) runs its generic .p-price rewrite THEN
        // dispatches this event, in that order - so this always runs after
        // it and fully rebuilds the price row from data-resell-price/
        // data-price, discarding whatever the generic pass did to a card
        // currently showing the resell price. Without this, switching
        // currency while browsing the Resell filter would go stale (or
        // worse, get robux-converted, which resell licences never are)
        // until the next category click.
        window.addEventListener('currencychange', function () { products.forEach(syncCardPricing); });

        if (saleBox) saleBox.addEventListener('change', function () { onSale = saleBox.checked; refilter(true); });
        if (freeBox) freeBox.addEventListener('change', function () { onFree = freeBox.checked; refilter(true); });

        function closeSort() { if (sortField) sortField.classList.remove('open'); if (sortMenu) sortMenu.hidden = true; if (sortBtn) sortBtn.setAttribute('aria-expanded', 'false'); }
        function openSort() { if (sortField) sortField.classList.add('open'); if (sortMenu) sortMenu.hidden = false; if (sortBtn) sortBtn.setAttribute('aria-expanded', 'true'); }
        function setSort(mode, label) {
          sortMode = mode;
          if (sortBtnVal) sortBtnVal.textContent = label;
          sortOpts.forEach(function (o) {
            var active = o.getAttribute('data-sort') === mode;
            o.classList.toggle('active', active);
            o.setAttribute('aria-selected', active ? 'true' : 'false');
          });
          refilter(true);
        }
        if (sortBtn) sortBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (sortMenu && sortMenu.hidden) openSort(); else closeSort();
        });
        sortOpts.forEach(function (o) {
          o.addEventListener('click', function () {
            var label = o.querySelector('span') ? o.querySelector('span').textContent : o.textContent;
            setSort(o.getAttribute('data-sort'), label);
            closeSort();
          });
        });
        document.addEventListener('click', function (e) { if (sortField && !sortField.contains(e.target)) closeSort(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSort(); });

        if (clearBtn) clearBtn.addEventListener('click', function () {
          curCat = 'all'; curSub = null; query = ''; lo = 0; hi = maxPrice; onSale = false; onFree = false;
          if (searchEl) searchEl.value = '';
          if (saleBox) saleBox.checked = false;
          if (freeBox) freeBox.checked = false;
          syncCats(); paintRange(); refilter(true);
          try { history.replaceState(null, '', base); } catch (_) {}
        });

        paintRange();
        const initial = new URLSearchParams(location.search).get('cat');
        const hasInit = initial && ((chips && chips.querySelector('.chip[data-cat="' + initial + '"]')) || (sideCats && sideCats.querySelector('.fc-cat[data-cat="' + initial + '"]')));
        setCat(hasInit ? initial : 'all');

        // Lets a link (the Shop mega-menu's New Releases tile, currently the
        // only user of this) land pre-sorted instead of on Recommended.
        const initialSort = new URLSearchParams(location.search).get('sort');
        const initialSortOpt = initialSort && sortOpts.filter(function (o) { return o.getAttribute('data-sort') === initialSort; })[0];
        if (initialSortOpt) {
          var initialSortLabel = initialSortOpt.querySelector('span') ? initialSortOpt.querySelector('span').textContent : initialSortOpt.textContent;
          setSort(initialSort, initialSortLabel);
        }
      });
    })();

    if (!window.__singleFile) {
      const mainEl = document.querySelector('main');
      document.addEventListener('click', function (e) {
        const a = e.target.closest('a'); if (!a || a.target === '_blank') return;
        const href = a.getAttribute('href') || '';
        if (!/^\/(assets|minecraft|about|blog|post|tutorial|releases)?(\?|#|$)/.test(href)) return;

        const here = location.pathname.split('/').pop() || '/';
        const target = href.split(/[?#]/)[0] || '/';
        if (href.charAt(0) === '#' || (target === here && href.indexOf('#') !== -1 && href.indexOf('?') === -1)) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        e.preventDefault();
        if (mainEl) mainEl.classList.add('page-leaving');
        setTimeout(function () { location.href = href; }, 165);
      });

      window.addEventListener('pageshow', function (ev) {
        if (ev.persisted && mainEl) mainEl.classList.remove('page-leaving');
      });
    }

    (function () {
      const cards = document.querySelectorAll('a.tile, a.asset-visual');
      if (!cards.length) return;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      cards.forEach(function (card) {
        card.addEventListener('pointerdown', function (e) {
          card.classList.add('is-pressing');
          if (reduce) return;
          const r = card.getBoundingClientRect();
          const rip = document.createElement('span');
          rip.className = 'card-ripple';
          rip.style.setProperty('--rx', (e.clientX - r.left) + 'px');
          rip.style.setProperty('--ry', (e.clientY - r.top) + 'px');
          card.appendChild(rip);
          setTimeout(function () { rip.remove(); }, 640);
        });
        const release = function () { card.classList.remove('is-pressing'); };
        card.addEventListener('pointerup', release);
        card.addEventListener('pointerleave', release);
        card.addEventListener('pointercancel', release);
      });
    })();

    (function () {
      var KEY = 'coldd_cart_v1';
      // Every product is a digital download - there's no notion of buying
      // "2 of" one, since a licence isn't consumed by quantity. qty stays
      // in the item shape (checkout/order-item code elsewhere still reads
      // it) but is always forced to 1, including for carts saved by an
      // older version of this file that still had the +/- stepper.
      function normalizeCart(arr) { return (arr || []).map(function (i) { i.qty = 1; return i; }); }
      var cart = [];
      try { cart = normalizeCart(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { cart = []; }

      var countEl = document.getElementById('cartCount');
      var headCount = document.getElementById('cartHeadCount');
      var fab = document.getElementById('cartFab');
      var fabTotal = document.getElementById('cartFabTotal');
      var drawer = document.getElementById('cartDrawer');
      var overlay = document.getElementById('cartOverlay');
      var itemsEl = document.getElementById('cartItems');
      var emptyEl = document.getElementById('cartEmpty');
      var subEl = document.getElementById('cartSubtotal');

      // Broadcasts to any other cart instance on the same page (e.g. the
      // checkout page's own item list) so both stay in sync with what's
      // actually in localStorage - without this, editing the cart in one
      // place while the other still holds its stale page-load snapshot
      // could charge/display a different cart than what the user last saw.
      function save() {
        try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) {}
        try { window.dispatchEvent(new CustomEvent('coldd:cart-sync', { detail: { source: 'drawer' } })); } catch (_) {}
      }
      window.addEventListener('coldd:cart-sync', function (e) {
        if (e.detail && e.detail.source === 'drawer') return;
        try { cart = normalizeCart(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { cart = []; }
        updateBadge(); renderCart();
      });
      function money(n) { return window.__money ? window.__money(n) : ('$' + n); }
      function count() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
      function subtotal() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

      // The flat 80-Robux-per-$1 conversion (window.__robux/__money) is
      // only a display estimate for arbitrary numbers - it ignores each
      // product's real admin-configured robux_price (which reflects
      // Roblox's DevEx markup and can differ from a flat conversion).
      // product.html already prefers that real price when set; the cart/
      // checkout need to do the same instead of showing a generic
      // estimate. Robux pricing doesn't support resell licences (matches
      // product.html, which shows "Not available" for that combo).
      var ROBUX_PER_USD_FALLBACK = 80; // matches _shared/roblox.ts's ROBUX_PER_USD
      function catalogRobuxPrice(id) {
        var baseId = String(id).replace(/--resell$/, '').replace(/--bundle$/, '');
        var p = (window.__CATALOG || []).filter(function (c) { return c.id === baseId; })[0];
        // > 0, not != null: an admin-set robux_price of 0 is never really
        // intended (nothing should cost real money in USD and be free in
        // Robux) - treating it as "no override" instead of "R$ 0" is what
        // stops one bad field value from making a product unsellable via
        // Robux instead of just falling back to the flat estimate.
        return p && p.robuxPrice > 0 ? p.robuxPrice : null;
      }
      function itemUnitMoney(item) {
        var robuxMode = window.__currencyMode && window.__currencyMode() === 'robux';
        if (robuxMode && item.licence !== 'resell') {
          var rbx = catalogRobuxPrice(item.id);
          if (rbx != null) return 'R$ ' + Math.round(rbx).toLocaleString('en-US');
        }
        // A resell licence is never sold in Robux, so it must show USD even in
        // Robux mode. Falling through to money() applied the flat 80-per-dollar
        // display estimate and quoted a Robux price for something that cannot
        // be bought with Robux at all.
        if (robuxMode && item.licence === 'resell') {
          return window.__usd ? window.__usd(item.price) : ('$' + item.price);
        }
        return money(item.price);
      }
      function subtotalMoney() {
        if (window.__currencyMode && window.__currencyMode() === 'robux') {
          // A cart holding any resell item cannot total in Robux, so the whole
          // subtotal falls back to USD rather than silently estimating one.
          var hasResell = cart.some(function (i) { return i.licence === 'resell'; });
          if (hasResell) {
            return window.__usd ? window.__usd(subtotal()) : ('$' + subtotal());
          }
          var total = 0, allPriced = true;
          cart.forEach(function (i) {
            var rbx = catalogRobuxPrice(i.id);
            if (rbx == null) { allPriced = false; return; }
            total += rbx * i.qty;
          });
          if (allPriced) return 'R$ ' + Math.round(total).toLocaleString('en-US');
        }
        return money(subtotal());
      }
      function updateBadge() {
        var c = count();
        if (countEl) {
          countEl.textContent = c > 99 ? '99+' : c;
          countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
        }
        if (headCount) headCount.textContent = c + (c === 1 ? ' item' : ' items');
        if (fabTotal) fabTotal.textContent = subtotalMoney();
        if (fab) fab.classList.toggle('has-items', c > 0);
      }
      window.addEventListener('currencychange', function () { updateBadge(); renderCart(); });
      function clearCart() { cart = []; save(); updateBadge(); renderCart(); }
      function add(item) {
        var lic = item.licence || 'standard';
        var id = item.id + (lic === 'resell' ? '--resell' : '');
        var found = cart.filter(function (i) { return i.id === id; })[0];
        // Already in the cart - a digital licence isn't a quantity, so
        // clicking Add to cart again on the same item is a no-op rather
        // than stacking a second copy.
        if (!found) cart.push({ id: id, title: item.title, price: item.price, image: item.image, tag: item.tag || '', licence: lic, qty: 1 });
        save(); updateBadge(); renderCart();
      }
      window.__cartAdd = add;
      function removeItem(id) {
        cart = cart.filter(function (i) { return i.id !== id; });
        save(); updateBadge(); renderCart();
      }
      function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
      function renderCart() {
        if (!itemsEl) return;
        itemsEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = cart.length > 0;
        cart.forEach(function (i) {
          var row = document.createElement('div');
          row.className = 'cart-item';
          row.innerHTML =
            '<span class="ci-thumb" style="background-image:url(\'' + i.image + '\')"></span>' +
            '<div class="ci-info"><div class="ci-title">' + esc(i.title) + (i.licence === 'resell' ? ' <span style="color:var(--accent);font-size:11px;font-weight:700;">· RESELL</span>' : '') + '</div>' +
            '<div class="ci-price">' + itemUnitMoney(i) + '</div></div>' +
            '<button class="ci-remove" type="button" data-act="rm" aria-label="Remove">×</button>';
          row.querySelector('[data-act="rm"]').addEventListener('click', function () { removeItem(i.id); });

          // Opens the real product page in a new tab, like every other route
          // to a product. This was the last caller of the retired quick-view
          // modal - clicking a line in the cart / order summary reopened it.
          var openProductPage = function () {
            closeCart();
            var a = document.createElement('a');
            a.href = '/product?id=' + encodeURIComponent(i.id);
            a.target = '_blank'; a.rel = 'noopener';
            a.click();
          };
          row.querySelector('.ci-thumb').addEventListener('click', openProductPage);
          row.querySelector('.ci-info').addEventListener('click', openProductPage);
          itemsEl.appendChild(row);
        });
        if (subEl) subEl.textContent = subtotalMoney();
      }
      function openCart() { renderCart(); if (overlay) overlay.hidden = false;
        if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
        document.body.classList.add('no-scroll'); }
      function closeCart() { if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
        if (overlay) overlay.hidden = true; document.body.classList.remove('no-scroll'); }

      if (fab) fab.addEventListener('click', function (e) { e.preventDefault(); openCart(); });
      var cartCloseBtn = document.getElementById('cartClose');
      if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
      if (overlay) overlay.addEventListener('click', closeCart);
      var checkout = document.getElementById('cartCheckout');
      if (checkout) checkout.addEventListener('click', function () {
        if (!cart.length) return;
        closeCart();
        if (window.__goCheckout) window.__goCheckout(); else location.href = '/checkout';
      });

      function readCard(card) {
        var titleEl = card.querySelector('.p-name') || card.querySelector('.p-body h3');
        var priceEl = card.querySelector('.p-price');
        var thumb = card.querySelector('.p-thumb');
        var descEl = card.querySelector('.p-sum') || card.querySelector('.p-desc');
        var tag = card.getAttribute('data-catlabel') || (card.querySelector('.p-cat') ? card.querySelector('.p-cat').textContent.trim() : '');
        var bg = thumb ? (thumb.style.backgroundImage || getComputedStyle(thumb).backgroundImage) : '';
        var m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
        var title = titleEl ? titleEl.textContent.trim() : 'Product';
        // Reading the DISPLAYED .p-price text (or a data-usd captured from
        // it) is unsafe: syncCardPricing rebuilds that span via innerHTML
        // whenever the currency toggle flips to Robux, and the fresh span
        // carries no data-usd - so the fallback below parsed "R$ 12,999"
        // down to 12999 and priced the cart in Robux while displaying $.
        // data-price on the card itself is set once from the real catalog
        // USD number and never touched by currency-display code, so it's
        // the only value here immune to that race.
        var price = 0;
        var dp = card.getAttribute('data-price');
        if (dp != null && dp !== '') {
          price = parseFloat(dp) || 0;
        } else if (priceEl) {
          var du = priceEl.getAttribute('data-usd');
          price = du != null ? (parseFloat(du) || 0) : (parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0);
        }
        var mc = !!card.closest('#view-minecraft') || /minecraft/i.test(location.pathname);
        var cardId = card.getAttribute('data-id') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        // Matches product.html: prefer the admin-configured resell price
        // over the flat 3x estimate when the catalog has one set, so
        // quick-view and the full product page never disagree on price.
        var catalogProd = (window.__CATALOG || []).filter(function (c) { return c.id === cardId; })[0];
        return { id: cardId, title: title, price: price,
                 image: m ? m[1] : '', tag: tag,
                 desc: descEl ? descEl.textContent.trim() : '',
                 platform: mc ? 'Minecraft' : 'Roblox',
                 resell: card.getAttribute('data-resell') === 'yes',
                 resellPrice: catalogProd && catalogProd.resellPrice != null ? catalogProd.resellPrice : null };
      }
      document.addEventListener('click', function (e) {
        if (e.target.closest('.cart-drawer') || e.target.closest('.search-panel')) return;
        var card = e.target.closest('.product');
        if (!card) return;
        e.preventDefault();
        if (card.getAttribute('data-free') === 'yes') { window.open('https://discord.gg/coldd', '_blank', 'noopener'); return; }
        if (e.target.closest('.p-buy')) { add(readCard(card)); location.href = '/checkout'; }
        else if (e.target.closest('.p-add')) { add(readCard(card)); openCart(); }
        else {
          var a = document.createElement('a');
          a.href = '/product?id=' + encodeURIComponent(readCard(card).id);
          a.target = '_blank'; a.rel = 'noopener';
          a.click();
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeCart();
      });


      (function () {
        var pv = document.getElementById('view-product');
        if (!pv) return;
        // Matches product.html/checkout's fallback when a product has no
        // admin-set resell_price_usd.
        var RESELL_MULT = 3;
        var $ = function (id) { return document.getElementById(id); };
        var pdImg = $('pdImg'), pdThumbs = $('pdThumbs'), pdSale = $('pdSale');
        var pdImgPrev = $('pdImgPrev'), pdImgNext = $('pdImgNext');
        var pdVideo = $('pdVideo'), pdVideoFrame = $('pdVideoFrame');
        var pdCrumb = $('pdCrumb'), pdTitle = $('pdTitle'), pdSub = $('pdSub');
        var pdPrice = $('pdPrice'), pdPriceWas = $('pdPriceWas'), pdPriceRbx = $('pdPriceRbx'), pdPriceNote = $('pdPriceNote');
        var pdLicence = $('pdLicence'), pdLicLabel = $('pdLicLabel'), pdLicResell = $('pdLicResell');
        var pdTechList = $('pdTechList'), pdAbout = $('pdAbout');
        var pdRelated = $('pdRelated'), pdRelatedWrap = $('pdRelatedWrap'), pdFaqList = $('pdFaqList');
        var pdReferEarn = $('pdReferEarn'), pdReferCopy = $('pdReferCopy');
        var pdWish = $('pdWish'), pdWishTx = $('pdWishTx');
        var pdBuy = $('pdBuy'), pdOwned = $('pdOwned'), pdUpgrade = $('pdUpgrade');
        var pdTabUpdates = $('pdTabUpdates'), pdUpdCount = $('pdUpdCount'), pdRevCount = $('pdRevCount');
        var pdPaneUpdates = $('pdPaneUpdates'), pdPaneReviews = $('pdPaneReviews');
        var licBtns = pv.querySelectorAll('#pdLicence .pm-lic');
        var licPriceEls = pv.querySelectorAll('#pdLicence [data-licprice]');
        var cur = null;
        var curGallery = [];
        var curIdx = 0;

        function hsh(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
        function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
        function fiat(n) { return window.__fiat ? window.__fiat(n) : ('$' + n); }
        function robux(n) { return window.__robux ? window.__robux(n) : ('R$ ' + Math.round(n * 80)); }
        function humanize(slug) { return (slug || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

        function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return []; } }
        function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
        var WISH = 'coldd_wish_v1';

        function isOwned(slug) { return window.__coldOwned.has(slug); }
        window.__coldOwned.load().then(function () { if (cur) render(cur.id); });

        var FEATURES = ['Fully optimized and production ready', 'Clean, well organized and easy to edit files', 'Simple drag and drop setup', 'Free updates and lifetime support included', 'Works in unlimited games and projects'];

        function fmtRevDate(iso) {
          try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
          catch (e) { return iso; }
        }
        function reviewsFor(p) {
          return window.__reviews ? window.__reviews.productReviews(p.id) : [];
        }
        function updatesFor(p) {
          var list = Array.isArray(p.versions) ? p.versions.slice() : [];
          list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
          return list.map(function (v) { return { version: v.version, date: fmtRevDate(v.date), note: v.changelog || '' }; });
        }
        function techFor(p) {
          var h = hsh(p.id + 't');
          var size = ((h % 46) + 4) + '.' + (h % 9) + ' MB';
          var rows = p.platform === 'Minecraft'
            ? [['File Format', '.zip'], ['File Size', size], ['Compatible Versions', '1.20.x to 1.21.x']]
            : [
                ['File Format', '.rbxm'], ['File Size', size],
                ['Part Count', ((h % 900) + 120).toLocaleString('en-US')],
                ['MeshPart Count', ((h >>> 3) % 260 + 20).toLocaleString('en-US')],
                ['Union Count', ((h >>> 5) % 80).toLocaleString('en-US')],
                ['Script Count', ((h >>> 7) % 40 + 3).toLocaleString('en-US')]
              ];
          var t = p.tech || {};
          var overrides = { 'File Format': t.format, 'File Size': t.size, 'Part Count': t.parts, 'MeshPart Count': t.meshParts, 'Union Count': t.unions, 'Script Count': t.scripts };
          return rows.map(function (r) {
            var ov = overrides[r[0]];
            return (ov != null && ov !== '') ? [r[0], ov] : r;
          });
        }
        function formatLongDesc(text) {
          var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
          var html = '', items = [];
          function flush() {
            if (items.length) { html += '<ul class="pd-feat-list">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'; items = []; }
          }
          lines.forEach(function (line) {
            if (/^[-*]\s+/.test(line)) items.push(line.replace(/^[-*]\s+/, ''));
            else { flush(); html += '<p>' + esc(line) + '</p>'; }
          });
          flush();
          return html;
        }
        function robuxRaw(n) { return 'R$ ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
        function faqFor(p) {
          var priceStr = fiat(p.priceNum);
          var list = [
            ['When will I receive the purchased product?', 'You receive the source files available to download instantly after purchase.'],
            ['Can I use this in multiple games?', 'Yes, you can use it in as many games and projects as you would like.'],
            ['How do I add this to my game?', 'If you received an .rbxl file open it directly in Roblox Studio via File then Open. If you received an .rbxm file, drag it directly into your Workspace.'],
            ['How much does this cost?', 'This product costs ' + priceStr + ', it is a one time payment with no recurring fees or subscriptions.'],
            ['What if I need support or installation help?', 'Contact us via our discord support tickets at discord.gg/coldd or through email at support@coldd.dev'],
            ['Do I have to pay for future updates or support?', 'No, support is always free. Any updates we publish for this product are also free for all buyers. We do not offer custom changes, edits, or commissions for this product. Bug fixes related to the product itself are always free.'],
            ['Do I need to credit you in my game?', 'Credit is not required when using our assets, although it is appreciated if you do!'],
            ['Can I make money off this product?', 'Yes, you can monetize this product and profit commercially within your games and projects. You cannot resell or distribute source files or product files without an explicit resell license.'],
            ['Can I resell or redistribute this?', 'No, you cannot sell or distribute our products unless you have purchased a specific resell license. If you hold a resell license, you may resell the product under our reselling terms.'],
            ['Can I edit or update this product?', 'Yes, you can update, modify or edit any part of our products to fit within your games and projects.'],
            ['Can I pay in robux instead of real currency?', 'Yes you can purchase with robux on-site by simply selecting the robux purchase option. Keep in mind that real currency (USD) purchases are 50% cheaper than robux pricing.']
          ];
          if (p.platform === 'Minecraft') { list.splice(10, 1); list.splice(2, 1); }
          return list;
        }

        function setMain(src) {
          // alt was never set here, so the primary product visual on every
          // product page announced nothing to a screen reader.
          if (pdImg) {
            pdImg.src = src || '';
            pdImg.alt = cur && cur.title ? cur.title : '';
          }
          pdThumbs && pdThumbs.querySelectorAll('.pd-thumb').forEach(function (t) {
            t.classList.toggle('active', t.getAttribute('data-src') === src);
          });
          // Tracked separately from pdImg.src, which the browser resolves to
          // an absolute URL - it would never match curGallery's raw strings
          // on the next lookup, so indexOf(pdImg.src) silently broke cycling
          // after the first step.
          var idx = curGallery.indexOf(src);
          if (idx >= 0) curIdx = idx;
          var multi = curGallery.length > 1;
          if (pdImgPrev) pdImgPrev.hidden = !multi;
          if (pdImgNext) pdImgNext.hidden = !multi;
        }
        function stepMain(dir) {
          if (curGallery.length < 2) return;
          curIdx = (curIdx + dir + curGallery.length) % curGallery.length;
          setMain(curGallery[curIdx]);
        }
        if (pdImgPrev) pdImgPrev.addEventListener('click', function () { stepMain(-1); });
        if (pdImgNext) pdImgNext.addEventListener('click', function () { stepMain(1); });
        function gallery(p) {
          var imgs = p.image ? [p.image] : [];
          if (Array.isArray(p.gallery) && p.gallery.length) {
            p.gallery.forEach(function (src) { if (src && imgs.indexOf(src) < 0) imgs.push(src); });
            return imgs;
          }
          var cat = window.__CATALOG || [];
          for (var i = 0; i < cat.length && imgs.length < 5; i++) {
            if (cat[i].platform === p.platform && cat[i].image && imgs.indexOf(cat[i].image) < 0) imgs.push(cat[i].image);
          }
          return imgs;
        }
        function refreshPrice() {
          if (!cur) return;
          var isResell = cur.licence === 'resell';
          var showRbx = cur.platform !== 'Minecraft' && !isResell;
          var resellUsd = cur.resellPrice != null ? cur.resellPrice : Math.round(cur.priceNum * RESELL_MULT);
          var base = isResell ? resellUsd : cur.priceNum;
          cur.price = base; cur.licence = cur.licence;
          if (pdPrice) pdPrice.textContent = fiat(base);
          if (pdPriceWas) {
            if (!isResell && cur.was > cur.priceNum) { pdPriceWas.textContent = fiat(cur.was); pdPriceWas.hidden = false; }
            else pdPriceWas.hidden = true;
          }
          if (pdPriceRbx) { pdPriceRbx.textContent = showRbx ? (cur.robuxPrice > 0 ? robuxRaw(cur.robuxPrice) : robux(base)) : ''; pdPriceRbx.hidden = !showRbx; }
          if (pdPriceNote) pdPriceNote.hidden = !showRbx;
          if (pdSale) pdSale.hidden = !(cur.was > cur.priceNum);
          var robuxMode = window.__currencyMode ? window.__currencyMode() === 'robux' : false;
          licPriceEls.forEach(function (el) {
            var isResellOpt = el.getAttribute('data-licprice') === 'resell';
            // Resell licences are not sold in Robux, but "Not available" read
            // as though the licence itself were unavailable rather than just
            // that one currency. Showing the real USD price is honest and
            // still buyable - the buyer simply pays for it by card.
            if (isResellOpt && robuxMode) {
              el.textContent = window.__usd ? window.__usd(resellUsd) : ('$' + resellUsd);
              return;
            }
            if (!isResellOpt && robuxMode && cur.robuxPrice > 0) { el.textContent = robuxRaw(cur.robuxPrice); return; }
            var pp = isResellOpt ? resellUsd : cur.priceNum;
            el.textContent = window.__money ? window.__money(pp) : fiat(pp);
          });
          if (pdReferEarn) pdReferEarn.textContent = 'earn ' + fiat(Math.round(cur.priceNum * 0.2 * 100) / 100);
        }
        function setLic(lic) {
          if (!cur) return;
          cur.licence = lic;
          licBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lic') === lic); });
          refreshPrice();
        }
        licBtns.forEach(function (b) { b.addEventListener('click', function () { setLic(b.getAttribute('data-lic')); }); });

        function starRow(n) {
          var h = '';
          for (var i = 0; i < 5; i++) h += '<span class="pd-star ' + (i < n ? 'on' : '') + '">' + STAR_SVG + '</span>';
          return h;
        }
        function relatedCard(p) {
          var robuxMode = window.__currencyMode ? window.__currencyMode() === 'robux' : false;
          var rbx = robuxMode ? catalogRobuxPrice(p.id) : null;
          var priceText = rbx != null ? ('R$ ' + Math.round(rbx).toLocaleString('en-US')) : (window.__money ? window.__money(p.priceNum) : ('$' + p.priceNum));
          return '<article class="product" data-id="' + esc(p.id) + '" data-resell="' + (p.resell ? 'yes' : 'no') + '" data-catlabel="' + esc(p.cat) + '" data-price="' + p.priceNum + '">' +
            '<div class="p-thumb" style="background-image:url(\'' + p.image + '\')"></div>' +
            '<div class="p-body"><h3 class="p-name">' + esc(p.title) + '</h3>' +
            '<div class="p-price-row"><span class="p-price" data-usd="' + p.priceNum + '">' + priceText + '</span></div>' +
            '<p class="p-sum">' + esc(p.desc) + '</p>' +
            '<div class="p-actions"><button class="p-buy" type="button">Buy now</button>' +
            '<button class="p-add" type="button">Add to cart</button></div></div></article>';
        }
        function related(p) {
          var cat = (window.__CATALOG || []).filter(function (x) { return x.id !== p.id && x.platform === p.platform; });
          function score(x) {
            var s = 0;
            if (x.subcat && x.subcat === p.subcat) s += 4;
            if (x.cat === p.cat) s += 3;
            if (x.resell === p.resell) s += 1;
            var a = p.title.toLowerCase().split(/\s+/), b = x.title.toLowerCase();
            a.forEach(function (w) { if (w.length > 3 && b.indexOf(w) >= 0) s += 1; });
            return s;
          }
          cat.sort(function (a, b) { return score(b) - score(a); });
          return cat.slice(0, 4);
        }

        // Real "customers who bought this also bought" signal from actual
        // paid orders - related() above is pure content similarity (same
        // category/subcat/title-word-overlap), which knows nothing about
        // what people actually buy together. Needs a round trip the
        // initial render above shouldn't block on, so it's fetched async
        // and the also-bought results are put first once they land -
        // real behavioral signal outranks a content-similarity guess.
        function fetchAlsoBought(p) {
          if (!window.coldSupabase || !pdRelated) return;
          window.coldSupabase.rpc('get_also_bought', { p_slug: p.id, p_limit: 8 }).then(function (res) {
            if (!cur || cur.id !== p.id) return; // navigated away before this resolved
            var slugs = (res.data || []).map(function (row) { return row.product_slug; });
            if (!slugs.length) return;
            var bySlug = {};
            (window.__CATALOG || []).forEach(function (x) { bySlug[x.id] = x; });
            var alsoBought = slugs.map(function (s) { return bySlug[s]; }).filter(Boolean);
            if (!alsoBought.length) return;
            var already = {}; alsoBought.forEach(function (x) { already[x.id] = true; });
            var blended = alsoBought.concat(related(p).filter(function (x) { return !already[x.id]; })).slice(0, 4);
            pdRelated.innerHTML = blended.map(relatedCard).join('');
            if (pdRelatedWrap) pdRelatedWrap.hidden = blended.length === 0;
          }).catch(function () {});
        }

        var curTab = 'overview';
        function showTab(t) {
          curTab = t;
          pv.querySelectorAll('.pd-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
          pv.querySelectorAll('.pd-tabpane').forEach(function (s) { s.hidden = s.getAttribute('data-pane') !== t; });
        }
        pv.querySelectorAll('.pd-tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });

        /* Switching the tab alone leaves the reader at the top of the product
           page with the reviews a scroll away, so "Review" from the dashboard
           and "Leave a review" here both appeared to do nothing. Scroll the
           panel into view under the sticky header, and when the intent is to
           write, focus the textarea.

           The compose form only exists once ownership resolves, which is
           async, so a deep link has to wait for it rather than assume it is
           already in the DOM. */
        function goToReviews(compose) {
          showTab('reviews');
          var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

          /* Switching the tab alone left the reader at the top of the page
             with the reviews a full screen below, so "Review" from the
             dashboard and "Leave a review" here both looked like they did
             nothing. Scrolling stops the moment the reader takes over. */
          var stop = false;
          function release() { stop = true; }
          window.addEventListener('wheel', release, { passive: true, once: true });
          window.addEventListener('touchmove', release, { passive: true, once: true });
          window.addEventListener('keydown', function (e) {
            if (/^(Page|Arrow|Home|End| )/.test(e.key)) release();
          }, { once: true });

          // scrollIntoView rather than computing an offset against window:
          // it finds whichever ancestor actually scrolls, and the sticky
          // header is handled by scroll-margin-top on .pd-panelbox instead of
          // arithmetic here. Re-run for a short window because gallery images
          // land after this and push the panel down.
          var deadline = Date.now() + 2000, first = true;
          (function settle() {
            if (stop) return;
            var box = pv.querySelector('.pd-panelbox') || $('pdPaneReviews');
            if (box) {
              box.scrollIntoView({ block: 'start', behavior: (first && !reduce) ? 'smooth' : 'auto' });
              first = false;
            }
            if (Date.now() < deadline) setTimeout(settle, 150);
          })();

          if (!compose) return;
          var tries = 0;
          (function awaitForm() {
            var ta = document.getElementById('pdRevText');
            if (ta) {
              // Don't yank the page back up; the scroll above already framed it.
              ta.focus({ preventScroll: true });
              return;
            }
            if (tries++ < 40) setTimeout(awaitForm, 50);
          })();
        }

        function syncWish() {
          if (!cur || !pdWish) return;
          var on = lsGet(WISH).indexOf(cur.id) >= 0;
          pdWish.classList.toggle('on', on);
          if (pdWishTx) pdWishTx.textContent = on ? 'In your wishlist' : 'Add to wishlist';
        }
        function syncOwned() {
          if (!cur) return;
          if (!window.__coldOwned.ready()) {
            // Ownership isn't known yet - hide both CTAs rather than
            // flashing "Buy now" for someone who actually owns this.
            if (pdBuy) pdBuy.hidden = true;
            if (pdOwned) pdOwned.hidden = true;
            return;
          }
          var owned = isOwned(cur.id);
          if (pdBuy) pdBuy.hidden = owned;
          if (pdOwned) pdOwned.hidden = !owned;
          if (pdUpgrade) pdUpgrade.hidden = !(owned && cur.resell);
        }

        /* The category filter matches on the catalog's own slug, which is not
           always what you get by slugifying the label: "Finished Games &
           Templates" is `game-templates`, "Scripts & UI" is `scripts-ui`. Four
           of the twelve Roblox categories differ, so deriving the slug from the
           label produced breadcrumb links that silently fell back to "all" —
           and now feeds those URLs to crawlers via BreadcrumbList. Look the
           real slug up, and only slugify as a last resort. */
        function catSlugFor(p) {
          var cats = window.__CATEGORIES || [];
          for (var i = 0; i < cats.length; i++) {
            if (cats[i].label === p.cat && cats[i].platform === p.platform) return cats[i].slug;
          }
          return (p.cat || '').toLowerCase().replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }

        function render(id) {
          var cat = window.__CATALOG || [], p = null, i;
          for (i = 0; i < cat.length; i++) if (cat[i].id === id) { p = cat[i]; break; }
          if (!p) p = cat[0];
          if (!p) return;
          var ups = updatesFor(p);
          var version = ups.length ? ups[0].version : 'v1.0';
          cur = { id: p.id, title: p.title, image: p.image, tag: p.cat, priceNum: p.priceNum, was: p.was || 0,
                  price: p.priceNum, licence: 'standard', resell: p.resell, platform: p.platform,
                  robuxPrice: p.robuxPrice != null ? p.robuxPrice : null,
                  resellPrice: p.resellPrice != null ? p.resellPrice : null };

          var catSlug = catSlugFor(p);
          var crumb = '<a href="/">Home</a><span>›</span>' +
            '<a href="' + (p.page || '/assets') + '">' + esc(p.platform) + '</a><span>›</span>' +
            '<a href="' + (p.page || '/assets') + '?cat=' + catSlug + '">' + esc(p.cat) + '</a>';
          if (p.subcat) crumb += '<span>›</span><span class="pd-crumb-cur">' + esc(humanize(p.subcat)) + '</span>';
          else crumb = crumb.replace('<a href="' + (p.page || '/assets') + '?cat=' + catSlug + '">' + esc(p.cat) + '</a>', '<span class="pd-crumb-cur">' + esc(p.cat) + '</span>');
          if (pdCrumb) pdCrumb.innerHTML = crumb;

          if (pdTitle) pdTitle.innerHTML = esc(p.title) + ' <span class="pd-ver">' + version + '</span>';
          if (pdSub) pdSub.textContent = p.desc || '';

          var g = gallery(p);
          curGallery = g;
          if (pdThumbs) {
            pdThumbs.innerHTML = '';
            if (g.length > 1) g.forEach(function (src) {
              var t = document.createElement('button'); t.type = 'button'; t.className = 'pd-thumb';
              t.setAttribute('data-src', src); t.setAttribute('aria-label', 'View image');
              t.style.backgroundImage = "url('" + src + "')";
              t.addEventListener('click', function () { setMain(src); });
              pdThumbs.appendChild(t);
            });
          }
          setMain(g[0] || '');
          if (pdVideo) pdVideo.hidden = !p.video;
          if (pdVideoFrame) pdVideoFrame.src = p.video || '';

          if (pdLicResell) pdLicResell.hidden = !p.resell;
          if (pdLicLabel) pdLicLabel.style.display = '';
          licBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lic') === 'standard'); });
          cur.licence = 'standard';
          refreshPrice();

          if (pdAbout) {
            pdAbout.innerHTML = '<h4>Product Features</h4>' + (p.longDesc && p.longDesc.trim()
              ? formatLongDesc(p.longDesc)
              : ('<p>' + esc(p.desc || '') + ' Every coldd release ships with clean, well documented files and free lifetime updates. If you get stuck, our team is one message away.</p>' +
                 '<ul class="pd-feat-list">' + FEATURES.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'));
          }
          if (pdTechList) pdTechList.innerHTML = techFor(p).map(function (r) { return '<div class="pd-tech-row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');

          var owned = isOwned(p.id);

          var revs = reviewsFor(p);
          if (pdRevCount) pdRevCount.textContent = '(' + revs.length + ')';
          if (pdPaneReviews) {
            var revFormHtml = owned ? (
              '<form class="pd-rev-form" id="pdRevForm">' +
                '<h4>Leave a review</h4>' +
                '<div class="pd-rev-stars-input" id="pdRevStarsInput">' +
                  [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="pd-rev-star-btn" data-star="' + n + '" aria-label="' + n + ' star">' + STAR_SVG + '</button>'; }).join('') +
                '</div>' +
                '<textarea id="pdRevText" maxlength="2000" rows="3" placeholder="Share what you thought of this product..."></textarea>' +
                '<button type="submit" class="btn btn-primary" id="pdRevSubmit">Submit review</button>' +
                '<p class="pd-rev-form-msg" id="pdRevFormMsg" hidden></p>' +
              '</form>'
            ) : '';
            pdPaneReviews.innerHTML = revFormHtml + (revs.length ? revs.map(function (r) {
              var reply = r.reply ? '<div class="pd-rev-reply"><div class="pd-rev-reply-head">coldd team replied</div><p>' + esc(r.reply.text) + '</p></div>' : '';
              return '<div class="pd-rev"><div class="pd-rev-head"><span class="pd-rev-name">' + esc(r.user) + '</span>' +
                '<span class="pd-rev-dot">·</span><span class="pd-rev-stars">' + starRow(r.stars) + '</span>' +
                '<span class="pd-rev-dot">·</span><span class="pd-rev-meta">' + esc(fmtRevDate(r.date)) + '</span></div>' +
                '<p class="pd-rev-body">' + esc(r.text) + '</p>' + reply + '</div>';
            }).join('') : '<p class="pd-empty">No reviews yet. Be the first to review this product.</p>');
          }

          if (pdTabUpdates) pdTabUpdates.hidden = ups.length === 0;
          if (pdUpdCount) pdUpdCount.textContent = '(' + ups.length + ')';
          if (pdPaneUpdates) {
            pdPaneUpdates.innerHTML = ups.map(function (u) {
              var dl = owned ? '<button class="btn btn-ghost pd-upd-dl" type="button">Download</button>' : '';
              return '<div class="pd-upd"><div class="pd-upd-head"><span class="pd-upd-v">' + esc(u.version) + '</span><span class="pd-upd-date">' + esc(u.date) + '</span></div>' +
                '<p class="pd-upd-note">' + esc(u.note) + '</p>' + dl + '</div>';
            }).join('');
          }
          if (curTab === 'updates' && ups.length === 0) showTab('overview'); else showTab(curTab);

          if (pdRelated) {
            var rel = related(p);
            pdRelated.innerHTML = rel.map(relatedCard).join('');
            if (pdRelatedWrap) pdRelatedWrap.hidden = rel.length === 0;
            fetchAlsoBought(p);
          }
          if (pdFaqList) {
            pdFaqList.innerHTML = faqFor(p).map(function (q, idx) {
              return '<details class="pd-faq-item"' + (idx === 0 ? ' open' : '') + '><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>';
            }).join('');
          }

          syncWish(); syncOwned();
          applySeo(p, ups);
        }

        /* The <head> shipped with /product describes the shell. Once we know
           which product this is, restate the title, canonical, link preview
           and structured data for that specific product. */
        function applySeo(p, ups) {
          var seo = window.coldSeo;
          if (!seo) { document.title = p.title + ' - coldd'; return; }

          var title = p.title + ' - coldd';
          var path = '/product?id=' + encodeURIComponent(p.id);
          var desc = p.desc || (p.longDesc || '').replace(/<[^>]+>/g, '') ||
            (p.title + ', a ' + (p.cat || 'game') + ' asset for ' + (p.platform || 'Roblox') + ' from coldd.');

          seo.apply({ title: title, description: desc, path: path, image: p.image, type: 'product' });

          var offer = {
            '@type': 'Offer',
            url: 'https://coldd.dev' + path,
            price: String(p.priceNum || 0),
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: 'coldd Development' }
          };
          var product = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.title,
            description: seo.clamp(desc, 300),
            image: [seo.abs(p.image)],
            sku: p.id,
            category: p.cat || '',
            brand: { '@type': 'Brand', name: 'coldd Development' },
            offers: offer
          };
          if (ups && ups.length && ups[0].version) product.releaseNotes = ups[0].version;
          // Only claim a rating when real approved reviews back it. An invented
          // aggregateRating is a manual-action risk, not just bad manners.
          if (p.reviews > 0 && p.rating > 0) {
            product.aggregateRating = {
              '@type': 'AggregateRating',
              ratingValue: String(p.rating),
              reviewCount: String(p.reviews),
              bestRating: '5', worstRating: '1'
            };
          }
          seo.jsonLd('ld-product', product);

          var catSlug = catSlugFor(p);
          var trail = [{ name: 'Home', path: '/' },
                       { name: p.platform || 'Shop', path: p.page || '/assets' }];
          if (p.cat) trail.push({ name: p.cat, path: (p.page || '/assets') + '?cat=' + catSlug });
          trail.push({ name: p.title, path: path });
          seo.jsonLd('ld-crumbs', seo.breadcrumbs(trail));
        }

        if ($('pdAddBtn')) $('pdAddBtn').addEventListener('click', function () { if (cur) { add(cur); openCart(); } });
        if ($('pdBuyBtn')) $('pdBuyBtn').addEventListener('click', function () {
          if (!cur) return; add(cur);
          if (window.__goCheckout) window.__goCheckout(); else if (!window.__go) location.href = '/checkout'; else window.__go('checkout');
        });
        if (pdWish) pdWish.addEventListener('click', function () {
          if (!cur) return; var w = lsGet(WISH), i = w.indexOf(cur.id);
          var adding = i < 0;
          if (i >= 0) w.splice(i, 1); else w.push(cur.id);
          lsSet(WISH, w); syncWish();
          if (window.__wishSync) window.__wishSync(cur.id, adding);
        });
        if (pdUpgrade) pdUpgrade.addEventListener('click', function () { if (cur) { setLic('resell'); add(cur); openCart(); } });
        if ($('pdDownload')) $('pdDownload').addEventListener('click', function () { showTab('updates'); });
        if ($('pdReview')) $('pdReview').addEventListener('click', function () { goToReviews(true); });
        if (pdReferCopy) pdReferCopy.addEventListener('click', function () {
          if (!cur) return;
          var link = location.origin + location.pathname + '?id=' + encodeURIComponent(cur.id) + '&ref=you';
          if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
          var t = pdReferCopy.textContent; pdReferCopy.textContent = 'Copied!';
          setTimeout(function () { pdReferCopy.textContent = t; }, 1400);
        });

        var revSelectedStars = 0;
        if (pdPaneReviews) {
          pdPaneReviews.addEventListener('click', function (e) {
            var starBtn = e.target.closest('.pd-rev-star-btn');
            if (!starBtn) return;
            revSelectedStars = Number(starBtn.getAttribute('data-star'));
            var btns = pdPaneReviews.querySelectorAll('.pd-rev-star-btn');
            for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', Number(btns[i].getAttribute('data-star')) <= revSelectedStars);
          });
          pdPaneReviews.addEventListener('submit', function (e) {
            var form = e.target.closest('#pdRevForm');
            if (!form || !cur) return;
            e.preventDefault();
            var msg = pdPaneReviews.querySelector('#pdRevFormMsg');
            var textEl = pdPaneReviews.querySelector('#pdRevText');
            var text = textEl ? textEl.value.trim() : '';
            var btn = form.querySelector('#pdRevSubmit');
            function showMsg(t) { if (msg) { msg.hidden = false; msg.textContent = t; } }
            if (!revSelectedStars) { showMsg('Please select a star rating.'); return; }
            if (!text) { showMsg('Please write a short review.'); return; }
            if (!window.coldAuth) return;
            if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
            window.coldAuth.invokeFn('submit-review', { slug: cur.id, stars: revSelectedStars, text: text })
              .then(function () {
                showMsg('Thanks! Your review is pending approval.');
                if (textEl) textEl.value = '';
                revSelectedStars = 0;
                var btns = pdPaneReviews.querySelectorAll('.pd-rev-star-btn');
                for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
                if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
              })
              .catch(function (err) {
                showMsg((err && err.message) || 'Could not submit review.');
                if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
              });
          });
        }

        function syncRelatedPricing() {
          if (!pdRelated) return;
          pdRelated.querySelectorAll('.product').forEach(function (card) {
            var id = card.getAttribute('data-id');
            var p = (window.__CATALOG || []).filter(function (x) { return x.id === id; })[0];
            if (!p) return;
            var priceEl = card.querySelector('.p-price');
            if (!priceEl) return;
            var robuxMode = window.__currencyMode ? window.__currencyMode() === 'robux' : false;
            var rbx = robuxMode ? catalogRobuxPrice(p.id) : null;
            priceEl.textContent = rbx != null ? ('R$ ' + Math.round(rbx).toLocaleString('en-US')) : (window.__money ? window.__money(p.priceNum) : ('$' + p.priceNum));
          });
        }
        window.addEventListener('currencychange', function () { if (cur) refreshPrice(); syncRelatedPricing(); });
        window.__renderProduct = render;
        if (!window.__singleFile) {
          pv.hidden = false;
          var q = (location.search.match(/[?&]id=([^&]+)/) || [])[1];
          render(q ? decodeURIComponent(q) : '');
          if (/[?&]tab=reviews\b/.test(location.search)) goToReviews(true);
        }
      })();

      window.addEventListener('currencychange', function () {
        updateBadge(); renderCart();
      });

      updateBadge();
    })();

    (function () {
      var btn = document.getElementById('accountBtn');
      if (!btn) return;

      function isLoggedIn() { try { return localStorage.getItem('coldd_auth') === 'in'; } catch (e) { return false; } }

      // coldd_auth is a client-only "was I signed in" flag, cached in
      // localStorage so the nav can render instantly without waiting on a
      // network round trip. It can still go stale even though the real
      // session also lives in localStorage now (see supabase-init.js) - a
      // refresh token can expire, get revoked, or belong to a banned/
      // deleted account, all of which leave this flag still saying "in"
      // with nothing backing it up. Without this, the nav shows a signed-
      // in account menu that dead-ends at /signin the moment its "Your
      // Account" link is followed. Reconciling the flag against the real
      // session on every load - not just gating dashboard-style pages -
      // fixes it where the stale state actually starts.
      if (window.coldSupabase) {
        window.coldSupabase.auth.getSession().then(function (res) {
          var hasSession = !!(res && res.data && res.data.session);
          var flaggedIn = isLoggedIn();
          if (hasSession === flaggedIn) return;
          try { localStorage.setItem('coldd_auth', hasSession ? 'in' : 'out'); } catch (e) {}
          if (!hasSession) { try { localStorage.removeItem('coldd_profile'); } catch (e) {} }
        }).catch(function () {});
      }

      var menu = null, overlay = null;

      function buildMenu() {
        menu = document.createElement('div');
        menu.className = 'account-menu';
        menu.hidden = true;
        var p = window.coldAuth && window.coldAuth.getProfile ? window.coldAuth.getProfile() : null;
        var initial = (p && p.name) ? p.name.trim().charAt(0).toUpperCase() : '?';
        var avatarUrl = window.coldAuth && window.coldAuth.avatarUrlFor ? window.coldAuth.avatarUrlFor(p) : (p && p.avatar);
        var avatarHtml = avatarUrl
          ? '<span class="account-menu-av" style="background-image:url(' + avatarUrl + ')"></span>'
          : '<span class="account-menu-av">' + initial + '</span>';
        menu.innerHTML =
          '<a href="/dashboard" class="account-menu-item">' + avatarHtml + '<span>Your Account</span></a>' +
          '<button type="button" class="account-menu-item account-menu-signout" id="menuSignout">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>' +
          '<span>Sign out</span></button>';
        btn.parentNode.style.position = 'relative';
        btn.parentNode.appendChild(menu);
        menu.querySelector('#menuSignout').addEventListener('click', function () {
          closeMenu();
          openConfirm();
        });
      }

      function toggleMenu() {
        if (!menu) buildMenu();
        menu.hidden = !menu.hidden;
      }
      function closeMenu() { if (menu) menu.hidden = true; }

      function buildConfirm() {
        overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.hidden = true;
        overlay.innerHTML =
          '<div class="confirm-modal"><p>Sign out of coldd?</p><div class="confirm-actions">' +
          '<button class="btn" type="button" id="navSignoutCancel">Cancel</button>' +
          '<button class="btn btn-primary" type="button" id="navSignoutConfirm">Sign out</button>' +
          '</div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.hidden = true; });
        overlay.querySelector('#navSignoutCancel').addEventListener('click', function () { overlay.hidden = true; });
        overlay.querySelector('#navSignoutConfirm').addEventListener('click', function () {
          overlay.hidden = true;
          try { localStorage.setItem('coldd_auth', 'out'); } catch (e) {}
          (window.coldAuth ? window.coldAuth.signOut() : Promise.resolve()).then(function () { location.href = '/'; });
        });
      }
      function openConfirm() { if (!overlay) buildConfirm(); overlay.hidden = false; }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (isLoggedIn()) toggleMenu();
        else location.href = '/signin';
      });
      document.addEventListener('click', function (e) {
        if (menu && !menu.hidden && !e.target.closest('.account-menu') && e.target !== btn && !e.target.closest('#accountBtn')) closeMenu();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    })();

    (function () {
      var wrap = document.getElementById('notifWrap');
      var btn = document.getElementById('notifBtn');
      var panel = document.getElementById('notifPanel');
      var list = document.getElementById('notifList');
      var badge = document.getElementById('notifBadge');
      var markAllBtn = document.getElementById('notifMarkAll');
      if (!wrap || !btn || !panel || !list || !badge) return;

      function isLoggedIn() { try { return localStorage.getItem('coldd_auth') === 'in'; } catch (e) { return false; } }
      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function fmtWhen(iso) {
        var d = new Date(iso), diff = Date.now() - d.getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      }

      var NOTIFS = [];

      function renderBadge() {
        var unread = NOTIFS.filter(function (n) { return !n.read_at; }).length;
        if (unread > 0) { badge.hidden = false; badge.textContent = unread > 99 ? '99+' : String(unread); }
        else badge.hidden = true;
      }

      function renderList() {
        if (!NOTIFS.length) { list.innerHTML = '<p class="notif-empty">No notifications yet.</p>'; return; }
        list.innerHTML = NOTIFS.map(function (n) {
          var tag = n.url ? 'a' : 'div';
          var href = n.url ? ' href="' + esc(n.url) + '"' : '';
          return '<' + tag + ' class="notif-item' + (n.read_at ? '' : ' unread') + '" data-id="' + esc(n.id) + '"' + href + '>' +
            '<div class="notif-item-title">' + esc(n.title) + '</div>' +
            (n.body ? '<div class="notif-item-body">' + esc(n.body) + '</div>' : '') +
            '<div class="notif-item-date">' + fmtWhen(n.created_at) + '</div>' +
            '</' + tag + '>';
        }).join('');
      }

      function loadNotifs() {
        if (!window.coldSupabase) return;
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data && res.data.session;
          if (!session) { wrap.hidden = true; return; }
          wrap.hidden = false;
          return window.coldSupabase.from('notifications').select('*').eq('user_id', session.user.id)
            .order('created_at', { ascending: false }).limit(50).then(function (r) {
              if (r.error) { console.error('[coldd] failed to load notifications:', r.error.message); return; }
              NOTIFS = r.data || [];
              renderBadge();
              if (!panel.hidden) renderList();
            });
        }).catch(function () {});
      }

      function markRead(ids) {
        if (!ids.length || !window.coldSupabase) return Promise.resolve();
        var now = new Date().toISOString();
        ids.forEach(function (id) {
          var n = NOTIFS.filter(function (x) { return x.id === id; })[0];
          if (n) n.read_at = now;
        });
        renderBadge(); renderList();
        return window.coldSupabase.from('notifications').update({ read_at: now }).in('id', ids).then(function () {});
      }

      function togglePanel() {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          renderList();
          var unreadIds = NOTIFS.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; });
          if (unreadIds.length) markRead(unreadIds);
        }
      }

      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); togglePanel(); });
      if (markAllBtn) markAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        markRead(NOTIFS.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; }));
      });
      document.addEventListener('click', function (e) {
        if (!panel.hidden && !e.target.closest('.nav-notif')) panel.hidden = true;
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.hidden = true; });

      loadNotifs();

      // Was load-once: a notification created while someone sat on a page
      // never appeared until they navigated or refreshed. Polling instead
      // of a realtime subscription - simplest fix that matches how the
      // rest of the site already works (no websocket/channel setup
      // anywhere else), at a low enough interval nobody perceives the
      // 60s-old-at-worst gap as "not live". Paused in background tabs so
      // it isn't hammering Supabase for every idle tab a visitor forgets
      // open, and reconciled instantly on return instead of waiting out
      // whatever was left of the interval.
      var pollId = setInterval(function () { if (!document.hidden) loadNotifs(); }, 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) loadNotifs(); });
      window.addEventListener('beforeunload', function () { clearInterval(pollId); });
    })();

    (function () {
      var KEY = 'coldd_auth';

      window.__isLoggedIn = function () { try { return localStorage.getItem(KEY) !== 'out'; } catch (e) { return true; } };
      function setState(v) { try { localStorage.setItem(KEY, v ? 'in' : 'out'); } catch (e) {} }

      window.__goDashboard = function () {
        if (window.__go) window.__go('dashboard');
        else location.href = '/dashboard';
      };
      window.__demoLogin = function () { setState(true); window.__goDashboard(); };

      // .dash is a generic two-column layout class reused by other pages
      // (the admin panel included) - .dash-page is what's actually unique
      // to the customer dashboard, and this block's redirect-to-/signin
      // logic further down must never fire anywhere else.
      var dash = document.querySelector('.dash-page');
      if (!dash) return;

      var adminLink = document.getElementById('dashAdminLink');
      if (adminLink && window.coldAuth) {
        window.coldAuth.checkIsAdmin().then(function (info) { if (info.isAdmin) adminLink.hidden = false; });
      }

      var panels = dash.querySelectorAll('.dash-panel');
      var navlinks = dash.querySelectorAll('.dash-nav a, [data-panel]');
      function showPanel(name) {
        panels.forEach(function (p) { p.hidden = (p.id !== 'panel-' + name); });
        dash.querySelectorAll('.dash-nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-panel') === name); });
        if (name === 'wishlist' && typeof renderWishlist === 'function') renderWishlist();
        if (name === 'account' && typeof loadSecurity === 'function') loadSecurity();
        if (name === 'referrals' && typeof refreshReferrals === 'function') refreshReferrals();
      }
      dash.addEventListener('click', function (e) {
        var a = e.target.closest('[data-panel]');
        if (a) { e.preventDefault(); showPanel(a.getAttribute('data-panel')); }
      });

      var initialPanel = new URLSearchParams(location.search).get('panel');
      if (initialPanel && dash.querySelector('#panel-' + initialPanel)) showPanel(initialPanel);

      // Wishlist has no backend table - it's the same coldd_wish_v1
      // localStorage array product.html already reads/writes (an array
      // of catalog ids), so this panel is just a live view onto it.
      var WISH_KEY = 'coldd_wish_v1';
      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function wishIds() { try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]') || []; } catch (e) { return []; } }
      function saveWishIds(ids) { try { localStorage.setItem(WISH_KEY, JSON.stringify(ids)); } catch (e) {} }
      // One-time backfill: anything wishlisted before wishlist_items existed
      // (or added on a device that was never signed in yet) was never
      // synced - dashboard load is the one place guaranteed to run for a
      // signed-in user with the full id list already in hand, so it's the
      // natural place to catch it up.
      if (window.__wishSync) wishIds().forEach(function (id) { window.__wishSync(id, true); });
      function wishPriceText(p) {
        var robuxMode = window.__currencyMode ? window.__currencyMode() === 'robux' : false;
        var rbx = robuxMode && p.robuxPrice > 0 ? p.robuxPrice : null;
        return rbx != null ? ('R$ ' + Math.round(rbx).toLocaleString('en-US')) : (window.__money ? window.__money(p.priceNum) : ('$' + p.priceNum));
      }
      function renderWishlist() {
        var el = document.getElementById('dashWishlistRows');
        if (!el) return;
        var ids = wishIds();
        var cat = window.__CATALOG || [];
        var items = ids.map(function (id) { return cat.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
        if (!items.length) { el.innerHTML = '<p class="dash-empty-note">Nothing saved yet - tap the heart on any product to add it here.</p>'; return; }
        el.innerHTML = items.map(function (p) {
          return '<div class="dash-row" data-id="' + esc(p.id) + '"><span class="dr-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
            '<div class="dr-main"><div class="dr-title">' + esc(p.title) + '</div><div class="dr-sub"><span class="p-price" data-usd="' + p.priceNum + '">' + wishPriceText(p) + '</span></div></div>' +
            '<div class="dr-actions"><button class="btn btn-ghost dr-cart" type="button">Add to cart</button><button class="wl-remove" type="button" aria-label="Remove">×</button></div></div>';
        }).join('');
      }
      // Overview-page preview box (capped, view-only) - mirrors the
      // "Recent purchases" card's look for the initial dashboard page.
      function renderWishlistPreview() {
        var el = document.getElementById('dashWishlistPreview');
        if (!el) return;
        var ids = wishIds().slice(0, 3);
        var cat = window.__CATALOG || [];
        var items = ids.map(function (id) { return cat.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
        el.innerHTML = items.length ? items.map(function (p) {
          return '<div class="dash-row"><span class="dr-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
            '<div class="dr-main"><div class="dr-title">' + esc(p.title) + '</div><div class="dr-sub"><span class="p-price" data-usd="' + p.priceNum + '">' + wishPriceText(p) + '</span></div></div>' +
            '<div class="dr-actions"><a class="btn btn-ghost dr-btn" href="/product?id=' + encodeURIComponent(p.id) + '">' + window.msym('visibility') + 'View</a></div></div>';
        }).join('') : '<p class="dash-empty-note">Nothing saved yet - tap the heart on any product to add it here.</p>';
      }
      // Real purchase-history-based recommendations (get_recommended_for_user:
      // other products in categories the signed-in user has actually bought
      // from before, weighted toward higher-rated/more-reviewed ones,
      // excluding anything they already own) - not shown at all for a buyer
      // with no purchase history yet, since there's nothing real to base it
      // on and an empty or random-looking "recommended" card is worse than
      // no card.
      function renderRecommended() {
        var card = document.getElementById('dashRecommendedCard');
        var el = document.getElementById('dashRecommended');
        if (!card || !el || !window.coldSupabase) return;
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data && res.data.session;
          if (!session) return;
          return window.coldSupabase.rpc('get_recommended_for_user', { p_user_id: session.user.id, p_limit: 3 }).then(function (r) {
            var slugs = (r.data || []).map(function (row) { return row.product_slug; });
            if (!slugs.length) return;
            var cat = window.__CATALOG || [];
            var items = slugs.map(function (s) { return cat.filter(function (p) { return p.id === s; })[0]; }).filter(Boolean);
            if (!items.length) return;
            el.innerHTML = items.map(function (p) {
              return '<div class="dash-row"><span class="dr-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
                '<div class="dr-main"><div class="dr-title">' + esc(p.title) + '</div><div class="dr-sub"><span class="p-price" data-usd="' + p.priceNum + '">' + wishPriceText(p) + '</span></div></div>' +
                '<div class="dr-actions"><a class="btn btn-ghost dr-btn" href="/product?id=' + encodeURIComponent(p.id) + '">' + window.msym('visibility') + 'View</a></div></div>';
            }).join('');
            card.hidden = false;
          });
        }).catch(function () {});
      }
      renderRecommended();

      window.addEventListener('currencychange', function () {
        if (document.getElementById('dashWishlistRows')) renderWishlist();
        if (document.getElementById('dashWishlistPreview')) renderWishlistPreview();
      });
      var wishlistRows = document.getElementById('dashWishlistRows');
      if (wishlistRows) wishlistRows.addEventListener('click', function (e) {
        var row = e.target.closest('.dash-row'); if (!row) return;
        var id = row.getAttribute('data-id');
        var p = (window.__CATALOG || []).filter(function (x) { return x.id === id; })[0];
        if (e.target.closest('.wl-remove')) {
          saveWishIds(wishIds().filter(function (x) { return x !== id; }));
          renderWishlist();
          if (window.__wishSync) window.__wishSync(id, false);
        } else if (e.target.closest('.dr-cart') && p) {
          if (window.__cartAdd) window.__cartAdd({ id: p.id, title: p.title, price: p.priceNum, image: p.image, tag: p.cat || '' });
          var btn = e.target.closest('.dr-cart');
          var t = btn.textContent; btn.textContent = 'Added ✓'; btn.disabled = true;
          setTimeout(function () { btn.textContent = t; btn.disabled = false; }, 1400);
        }
      });

      // Real purchase/ownership data, read live from Supabase (RLS already
      // scopes orders/order_items to the signed-in user).
      function fmtDate(iso) {
        try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
        catch (e) { return iso; }
      }
      function shortOrderId(id) { return '#' + String(id).slice(0, 8).toUpperCase(); }
      // Shared in-button spinner treatment - reuses the .btn-label/
      // .btn-spinner/.is-loading pattern already used on the full-page
      // auth forms (see styles.css's generic .btn.is-loading rules).
      function setBtnLoading(btn, loading) {
        if (!btn) return;
        btn.disabled = loading;
        btn.classList.toggle('is-loading', loading);
        var spinner = btn.querySelector('.btn-spinner');
        if (spinner) spinner.hidden = !loading;
      }

      // A completed order's amount is a fixed historical fact, not a live
      // price - Robux orders show the real R$ total, never routed through
      // the flat window.__robux() conversion (matches the same fix applied
      // to cart/checkout/admin this session).
      // Robux orders already showed their real R$ total. USD orders did not:
      // they went through window.__money(), so the amount tracked whatever
      // currency the header toggle happened to be set to. Both now report
      // what was charged.
      function orderMoney(o) {
        if (o.currency === 'robux') {
          return 'R$ ' + Math.round(Number(o.total_robux) || 0).toLocaleString('en-US');
        }
        var usd = Number(o.total_usd) || 0;
        return '$' + usd.toFixed(2).replace(/\.00$/, '');
      }

      function renderPurchases(orders) {
        var body = document.getElementById('dashPurchasesBody');
        if (!body) return;
        if (!orders.length) { body.innerHTML = '<tr><td colspan="5">No orders yet.</td></tr>'; return; }
        body.innerHTML = orders.map(function (o) {
          var items = o.order_items || [];
          var titles = esc(items.map(function (i) { return i.title; }).join(', ') || '—');
          var badge = o.status === 'paid' ? 'ok' : 'warn';
          var label = o.status.charAt(0).toUpperCase() + o.status.slice(1);
          var priceCell = '<span class="p-price" data-fixed>' + orderMoney(o) + '</span>';
          return '<tr><td>' + fmtDate(o.created_at) + '</td><td>' + titles + '</td><td class="dt-mono">' + shortOrderId(o.id) + '</td>' +
            '<td>' + priceCell + '</td>' +
            '<td><span class="dt-badge ' + badge + '">' + label + '</span></td></tr>';
        }).join('');
      }

      function renderOverview(orders) {
        var recentEl = document.getElementById('dashRecentPurchases');
        if (recentEl) {
          var recent = orders.slice(0, 3);
          recentEl.innerHTML = recent.length ? recent.map(function (o) {
            var items = o.order_items || [];
            var first = items[0];
            var slug = first ? first.product_slug : '';
            var img = (first && first.products && first.products.image) ? window.imgUrl(first.products.image) : '/banner.jpg';
            var titles = esc(items.map(function (i) { return i.title; }).join(', ') || '—');
            var actions = slug ? '<a class="btn btn-ghost dr-btn" href="/product?id=' + encodeURIComponent(slug) + '">' + window.msym('visibility') + 'View</a>' : '';
            if (slug && o.status === 'paid') {
              actions += '<button class="btn btn-ghost dr-btn dr-download" type="button" data-slug="' + slug + '">' + window.msym('download') + 'Download</button>' +
                '<a class="btn btn-ghost dr-btn" href="/product?id=' + encodeURIComponent(slug) + '&tab=reviews">' + window.msym('reviews') + 'Review</a>';
            }
            return '<div class="dash-row"><span class="dr-thumb" style="background-image:url(\'' + img + '\')"></span>' +
              '<div class="dr-main"><div class="dr-title">' + titles + '</div><div class="dr-sub">' + fmtDate(o.created_at) + ' · ' + shortOrderId(o.id) + '</div></div>' +
              '<span class="p-price" data-fixed>' + orderMoney(o) + '</span>' +
              '<div class="dr-actions">' + actions + '</div></div>';
          }).join('') : '<p class="dash-empty-note">No purchases yet.</p>';
        }

        var wishEl = document.getElementById('dashWishlistPreview');
        if (wishEl && typeof renderWishlistPreview === 'function') renderWishlistPreview();
      }

      function ownedFromOrders(orders) {
        var bySlug = {};
        orders.forEach(function (o) {
          if (o.status !== 'paid') return;
          (o.order_items || []).forEach(function (i) {
            var existing = bySlug[i.product_slug];
            if (!existing || i.licence === 'resell') bySlug[i.product_slug] = i;
          });
        });
        return Object.keys(bySlug).map(function (slug) { return bySlug[slug]; });
      }

      function requestDownload(slug, btn) {
        // Swap only the label span's text when present (icon buttons like
        // .dp-btn), so a loading/error state doesn't wipe out the icon by
        // overwriting the whole button with textContent.
        var labelEl = btn.querySelector('span') || btn;
        var prev = labelEl.textContent;
        btn.disabled = true; labelEl.textContent = 'Preparing…';
        (window.coldAuth ? window.coldAuth.invokeFn('get-download-url', { slug: slug }) :
          window.coldSupabase.functions.invoke('get-download-url', { body: { slug: slug } }).then(function (res) {
            if (res.error || !res.data || !res.data.ok) throw new Error((res.data && res.data.error) || 'Unavailable');
            return res.data;
          }))
          .then(function (data) { window.open(data.url, '_blank', 'noopener'); btn.disabled = false; labelEl.textContent = prev; })
          .catch(function (err) { labelEl.textContent = (err && err.message) || 'Unavailable'; });
      }
      var DOWNLOAD_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
      var RESELL_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      function downloadBtn(item, cls) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = cls;
        btn.innerHTML = DOWNLOAD_ICON_SVG + '<span>Download</span>';
        btn.addEventListener('click', function () { requestDownload(item.product_slug, btn); });
        return btn;
      }

      function renderOwnedAndDownloads(orders) {
        var owned = ownedFromOrders(orders);
        var grid = document.getElementById('dashOwnedGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!owned.length) {
          grid.innerHTML = '<div class="dash-empty-cta"><p>You don\'t own any products yet.</p>' +
            '<a class="btn btn-primary" href="/assets">Browse products</a></div>';
        }
        else owned.forEach(function (item) {
          var img = item.products && item.products.image ? window.imgUrl(item.products.image) : '/banner.jpg';
          var isResell = item.licence === 'resell';
          var card = document.createElement('div'); card.className = 'dash-prod';
          card.innerHTML = '<div class="dp-thumb" style="background-image:url(\'' + img + '\')">' +
            (isResell ? '<span class="dp-lic-badge" aria-label="Resell licence">' + RESELL_ICON_SVG + '<span aria-hidden="true">Resell</span></span>' : '<span class="sr-only">Standard licence</span>') +
            '</div><div class="dp-body"><div class="dp-name"></div></div>';
          card.querySelector('.dp-name').textContent = item.title;
          card.querySelector('.dp-body').appendChild(downloadBtn(item, 'btn btn-tinted dp-btn'));
          grid.appendChild(card);
        });
      }

      var dashRecentPurchasesEl = document.getElementById('dashRecentPurchases');
      if (dashRecentPurchasesEl) dashRecentPurchasesEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.dr-download');
        if (!btn) return;
        requestDownload(btn.getAttribute('data-slug'), btn);
      });

      function loadRealData(userId) {
        window.coldSupabase
          .from('orders')
          .select('id, created_at, status, currency, total_usd, total_robux, order_items(product_slug, title, qty, licence, products(image))')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .then(function (res) {
            // Purchase history should show purchases, not attempts. Every
            // status short of 'paid' - abandoned Stripe/PayPal checkouts,
            // still-confirming crypto/Robux, failed, canceled - is not a
            // purchase yet, so none of it belongs here even briefly.
            var orders = ((res && res.data) || []).filter(function (o) { return o.status === 'paid'; });
            renderOverview(orders);
            renderPurchases(orders);
            renderOwnedAndDownloads(orders);
          });
      }

      // Authoritative session check - redirects if the fast <head> pre-check
      // let a stale/expired token slip through, and drives all real-data
      // rendering above once we know who's signed in.
      if (window.coldSupabase) {
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data ? res.data.session : null;
          if (!session) { location.href = '/signin'; return; }
          loadRealData(session.user.id);
          loadNotificationPrefs(session.user.id);
          // The cached local profile (localStorage) can have a blank email
          // for accounts that signed up via Roblox (which has no real email
          // to hand us at sign-in time) - the session's user.email is always
          // the real, current value, so it wins here.
          var acEmailEl = document.getElementById('ac-email');
          if (acEmailEl && session.user.email) acEmailEl.value = session.user.email;
        });
      }

      var NTF_DEFAULTS = { orderReceipts: true, productUpdates: true, promotions: true, saleDms: true, roleSync: true, supportReplies: true };
      var NTF_IDS = { orderReceipts: 'ntfOrderReceipts', productUpdates: 'ntfProductUpdates', promotions: 'ntfPromotions', saleDms: 'ntfSaleDms', roleSync: 'ntfRoleSync', supportReplies: 'ntfSupportReplies' };
      function loadNotificationPrefs(userId) {
        window.coldSupabase.from('profiles').select('notification_prefs').eq('id', userId).maybeSingle().then(function (res) {
          var prefs = Object.assign({}, NTF_DEFAULTS, (res && res.data && res.data.notification_prefs) || {});
          Object.keys(NTF_IDS).forEach(function (key) {
            var el = document.getElementById(NTF_IDS[key]);
            if (el) el.checked = !!prefs[key];
          });
        });
      }
      var ntfSaveBtn = document.getElementById('ntfSaveBtn');
      if (ntfSaveBtn) ntfSaveBtn.addEventListener('click', function () {
        var msgEl = document.getElementById('ntfMsg');
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data ? res.data.session : null;
          if (!session) return;
          var prefs = {};
          Object.keys(NTF_IDS).forEach(function (key) {
            var el = document.getElementById(NTF_IDS[key]);
            prefs[key] = el ? el.checked : NTF_DEFAULTS[key];
          });
          setBtnLoading(ntfSaveBtn, true);
          window.coldSupabase.from('profiles').update({ notification_prefs: prefs }).eq('id', session.user.id).then(function (upRes) {
            setBtnLoading(ntfSaveBtn, false);
            if (msgEl) { msgEl.className = upRes.error ? 'co-msg err show' : 'co-msg show'; msgEl.textContent = upRes.error ? (upRes.error.message || 'Could not save.') : 'Saved.'; }
          });
        });
      });

      var robloxStatusEl = document.getElementById('robloxLinkStatus');
      var robloxLinkBtn = document.getElementById('robloxLinkBtn');
      var robloxUnlinkBtn = document.getElementById('robloxUnlinkBtn');
      if (robloxStatusEl && window.coldAuth && window.coldSupabase) {
        window.coldAuth.robloxLinkStatus().then(function (res) {
          if (res && res.ok && res.linked) {
            robloxStatusEl.textContent = 'Linked as ' + res.robloxUsername + '.';
            if (robloxUnlinkBtn) robloxUnlinkBtn.hidden = false;
          } else {
            robloxStatusEl.textContent = 'Not linked yet. Link your Roblox account to pay with Robux.';
            if (robloxLinkBtn) robloxLinkBtn.hidden = false;
          }
        }).catch(function () {
          robloxStatusEl.textContent = 'Could not check Roblox link status.';
        });
      }
      if (robloxLinkBtn) robloxLinkBtn.addEventListener('click', function () { window.coldAuth.signInRoblox(); });
      if (robloxUnlinkBtn) robloxUnlinkBtn.addEventListener('click', function () {
        robloxUnlinkBtn.disabled = true;
        window.coldAuth.unlinkRoblox().then(function () {
          robloxUnlinkBtn.hidden = true;
          if (robloxLinkBtn) robloxLinkBtn.hidden = false;
          if (robloxStatusEl) robloxStatusEl.textContent = 'Not linked yet. Link your Roblox account to pay with Robux.';
        }).finally(function () { robloxUnlinkBtn.disabled = false; });
      });

      var refCopy = document.getElementById('refCopy');
      if (refCopy) refCopy.addEventListener('click', function () {
        var inp = document.getElementById('refLink'); if (!inp) return;
        inp.select();
        try { navigator.clipboard.writeText(inp.value); } catch (e) { try { document.execCommand('copy'); } catch (_) {} }
        var t = refCopy.textContent; refCopy.textContent = 'Copied'; setTimeout(function () { refCopy.textContent = t; }, 1400);
      });

      var refStats = null;
      var refLoaded = false;
      function refFmtUsd(n) { return window.__money ? window.__money(n) : ('$' + n); }
      function refFmtRobux(n) { return 'R$ ' + n; }
      function refFmtDate(iso) {
        try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
        catch (e) { return iso; }
      }
      function refEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function refreshReferrals() {
        if (refLoaded || !window.coldAuth) return;
        refLoaded = true;
        window.coldAuth.invokeFn('get-referral-code', {}).then(function (codeRes) {
          var refLinkEl = document.getElementById('refLink');
          if (refLinkEl && codeRes && codeRes.code) refLinkEl.value = location.origin + '/?ref=' + codeRes.code;
        }).catch(function () {});

        window.coldAuth.invokeFn('get-referral-stats', {}).then(function (res) {
          refStats = res;
          var earnedEl = document.getElementById('refStatEarned');
          if (earnedEl) earnedEl.textContent = refFmtUsd(res.earnedUsd) + (res.earnedRobux ? ' + ' + refFmtRobux(res.earnedRobux) : '');
          var availEl = document.getElementById('refStatAvailable');
          if (availEl) availEl.textContent = refFmtUsd(res.availableUsd) + (res.availableRobux ? ' + ' + refFmtRobux(res.availableRobux) : '');
          var paidEl = document.getElementById('refStatPaid');
          if (paidEl) paidEl.textContent = refFmtUsd(res.paidUsd) + (res.paidRobux ? ' + ' + refFmtRobux(res.paidRobux) : '');

          var clicksEl = document.getElementById('refStatClicks'); if (clicksEl) clicksEl.textContent = res.clicks;
          var signupsEl = document.getElementById('refStatSignups'); if (signupsEl) signupsEl.textContent = res.signups;
          var convEl = document.getElementById('refStatConversions'); if (convEl) convEl.textContent = res.conversions;
          var rateEl = document.getElementById('refStatRate'); if (rateEl) rateEl.textContent = (res.clicks ? Math.round((res.conversions / res.clicks) * 1000) / 10 : 0) + '%';

          var actBody = document.getElementById('refActivityBody');
          if (actBody) {
            var rows = res.recentReferrals || [];
            actBody.innerHTML = rows.length ? rows.map(function (r) {
              var status = r.converted ? '<span class="dt-badge ok">Converted</span>' : '<span class="dt-badge warn">Signed up</span>';
              return '<tr><td>' + refEsc(r.name) + '</td><td>' + refFmtDate(r.date) + '</td><td>' + status + '</td><td>' + (r.earned ? refFmtUsd(r.earned) : '') + '</td></tr>';
            }).join('') : '<tr><td colspan="4" class="adm-empty">No referrals yet.</td></tr>';
          }

          var payBody = document.getElementById('refPayoutBody');
          if (payBody) {
            var payouts = res.payouts || [];
            payBody.innerHTML = payouts.length ? payouts.map(function (p) {
              var amount = p.method === 'robux' ? refFmtRobux(p.amount_robux || 0) : refFmtUsd(p.amount_usd || 0);
              var status = p.status === 'paid' ? '<span class="dt-badge ok">Paid</span>' : p.status === 'denied' ? '<span class="dt-badge err">Denied</span>' : '<span class="dt-badge warn">Requested</span>';
              var method = p.method === 'usd' ? 'USD' : p.method === 'robux' ? 'Robux' : 'Store credit';
              return '<tr><td>' + refFmtDate(p.requested_at) + '</td><td>' + method + '</td><td>' + amount + '</td><td>' + status + '</td></tr>';
            }).join('') : '<tr><td colspan="4" class="adm-empty">No payout requests yet.</td></tr>';
          }
        }).catch(function () {
          refLoaded = false;
        });
      }

      (function () {
        var dd = document.querySelector('.ref-method-dd');
        if (!dd) return;
        var native = dd.querySelector('.ref-method-native');
        var btn = dd.querySelector('.ref-method-btn');
        var val = dd.querySelector('.ref-method-val');
        var menu = dd.querySelector('.ref-method-menu');
        var opts = Array.prototype.slice.call(dd.querySelectorAll('.ref-method-opt'));
        function close() { dd.classList.remove('open'); menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
        function open() { dd.classList.add('open'); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
        function select(opt) {
          native.value = opt.getAttribute('data-value');
          val.textContent = opt.querySelector('span').textContent;
          opts.forEach(function (o) {
            var active = o === opt;
            o.classList.toggle('active', active);
            o.setAttribute('aria-selected', active ? 'true' : 'false');
          });
        }
        btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden ? open() : close(); });
        opts.forEach(function (o) { o.addEventListener('click', function () { select(o); close(); btn.focus(); }); });
        document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      })();

      var refPayoutForm = document.getElementById('refPayoutForm');
      if (refPayoutForm) refPayoutForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var msgEl = refPayoutForm.querySelector('.auth-msg');
        var btn = refPayoutForm.querySelector('.auth-submit');
        var method = document.getElementById('refPayoutMethod').value;
        var amount = parseFloat(document.getElementById('refPayoutAmount').value);
        if (!amount || amount <= 0) return;
        setBtnLoading(btn, true);
        window.coldAuth.invokeFn('request-referral-payout', { method: method, amount: amount }).then(function () {
          setBtnLoading(btn, false);
          if (msgEl) { msgEl.classList.add('show'); msgEl.textContent = 'Payout requested - our team will review it manually.'; }
          refPayoutForm.reset();
          refLoaded = false;
          refreshReferrals();
        }).catch(function (err) {
          setBtnLoading(btn, false);
          if (msgEl) { msgEl.classList.add('show'); msgEl.textContent = (err && err.message) || 'Could not request payout.'; }
        });
      });

      dash.querySelectorAll('.ref-tab').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-reftab');
          dash.querySelectorAll('.ref-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
          dash.querySelectorAll('.ref-pane').forEach(function (p) { p.hidden = p.getAttribute('data-refpane') !== k; });
        });
      });
      var refProdBody = document.getElementById('refProdBody');
      if (refProdBody) {
        var fmt = function (n) { return window.__money ? window.__money(n) : ('$' + n); };
        var cat = (window.__CATALOG || []).slice(0, 6);
        var hh = function (s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
        refProdBody.innerHTML = cat.map(function (p) {
          var h = hh(p.id), sales = h % 9, earn = Math.round(p.priceNum * 0.2 * 100) / 100;
          return '<tr><td>' + esc(p.title) + '</td><td><span class="p-price" data-usd="' + earn + '">' + fmt(earn) + '</span></td>' +
            '<td>' + sales + '</td><td><span class="p-price" data-usd="' + (earn * sales) + '">' + fmt(earn * sales) + '</span></td>' +
            '<td><button class="btn btn-ghost ref-prod-copy" type="button" data-link="' + (p.page || '/product') + '?id=' + p.id + '&ref=you">Copy link</button></td></tr>';
        }).join('');
        refProdBody.querySelectorAll('.ref-prod-copy').forEach(function (b) {
          b.addEventListener('click', function () {
            var link = location.origin + location.pathname.replace(/[^/]*$/, '') + b.getAttribute('data-link');
            try { navigator.clipboard.writeText(link); } catch (_) {}
            var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1400);
          });
        });
      }

      dash.querySelectorAll('.wl-remove').forEach(function (x) {
        x.addEventListener('click', function () { var row = x.closest('.dash-row'); if (row) row.remove(); });
      });
      dash.querySelectorAll('.dr-cart').forEach(function (b) {
        b.addEventListener('click', function () { var t = b.textContent; b.textContent = 'Added ✓'; b.disabled = true; setTimeout(function () { b.textContent = t; b.disabled = false; }, 1400); });
      });

      var acct = document.getElementById('acctForm');
      if (acct) {
        function acctFieldErr(name, msg) {
          var f = acct.querySelector('.auth-field[data-for="' + name + '"]'); if (!f) return;
          f.classList.toggle('invalid', !!msg);
          var e = f.querySelector('.auth-err'); if (e) e.textContent = msg || '';
        }
        function acctFlash(text) {
          var m = acct.querySelector('.auth-msg'); if (!m) return;
          m.textContent = text; m.classList.add('show');
        }

        // Email/password now only change via the Security tab's
        // re-auth-gated flow; this form is display-name only.
        acct.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!window.coldSupabase || !window.coldAuth) { acctFlash('Not available right now.'); return; }
          var profile = window.coldAuth.getProfile();
          var newName = acct.querySelector('[name="name"]').value.trim();
          if (!profile || !newName || newName === profile.name) { acctFlash('Nothing to update.'); return; }

          var btn = acct.querySelector('.auth-submit');
          setBtnLoading(btn, true);
          window.coldSupabase.from('profiles').update({ username: newName }).eq('id', profile.id).then(function (res) {
            setBtnLoading(btn, false);
            if (res.error) { acctFlash(res.error.message || 'Something went wrong.'); return; }
            profile.name = newName;
            window.coldAuth.saveProfile(profile);
            window.coldAuth.applyProfile();
            acctFlash('Saved.');
          });
        });
      }
      acct && acct.querySelectorAll('.auth-pw-toggle').forEach(function (b) {
        b.addEventListener('click', function () {
          var input = b.parentNode.querySelector('input'); if (!input) return;
          var show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          var off = b.querySelector('.eye-off'), on = b.querySelector('.eye-on');
          if (off && on) { off.style.display = show ? 'none' : ''; on.style.display = show ? '' : 'none'; }
        });
      });

      var del = document.getElementById('delAcct'), conf = document.getElementById('delConfirm');
      if (del && conf) {
        var delCodeEl = document.getElementById('delCode');
        var delCode = '';
        function genDeleteCode() {
          var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          var groups = [];
          for (var g = 0; g < 4; g++) {
            var s = '';
            for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
            groups.push(s);
          }
          return groups.join('-');
        }
        function showDeleteCode() {
          delCode = genDeleteCode();
          if (delCodeEl) delCodeEl.textContent = delCode;
        }
        del.addEventListener('click', function () {
          showDeleteCode();
          conf.hidden = false; del.style.display = 'none';
        });
        var cancel = document.getElementById('delCancel');
        if (cancel) cancel.addEventListener('click', function () { conf.hidden = true; del.style.display = ''; });
        var fin = document.getElementById('delFinal'), inp = document.getElementById('delInput'), delErr = document.getElementById('delErr');
        // Copy-pasting defeats the point of "type this out" - block paste
        // on the input outright, on top of user-select:none on the code
        // itself and the disabled right-click menu.
        if (inp) inp.addEventListener('paste', function (e) { e.preventDefault(); });
        if (fin) fin.addEventListener('click', function () {
          var typed = inp ? inp.value.trim() : '';
          if (typed !== delCode) {
            if (delErr) delErr.textContent = 'That doesn’t match the code above.';
            if (inp) { inp.style.borderColor = 'var(--accent)'; inp.focus(); }
            return;
          }
          if (delErr) delErr.textContent = '';
          if (!window.coldAuth) return;
          setBtnLoading(fin, true);
          window.coldAuth.invokeFn('delete-account', {}).then(function () {
            return (window.coldAuth ? window.coldAuth.signOut() : Promise.resolve()).then(function () { location.href = '/'; });
          }).catch(function (err) {
            setBtnLoading(fin, false);
            if (delErr) delErr.textContent = err.message || 'Could not delete your account.';
          });
        });
      }

      // ================================================================
      // SECURITY TAB - re-auth gate (password, falls back to email OTP),
      // email change, password change modal.
      // ================================================================
      function currentUser(cb) {
        window.coldSupabase.auth.getUser().then(function (res) { cb(res && res.data ? res.data.user : null); });
      }
      function evalPwStrength(v, fillEl, listEl) {
        var rules = { upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), number: /[0-9]/.test(v), special: /[^A-Za-z0-9]/.test(v), length: v.length > 8 };
        var met = 0;
        Object.keys(rules).forEach(function (k) {
          var li = listEl.querySelector('[data-rule="' + k + '"]');
          if (li) li.classList.toggle('met', rules[k]);
          if (rules[k]) met++;
        });
        fillEl.style.width = (met / 5 * 100) + '%';
        fillEl.style.background = met <= 2 ? '#ff4d44' : met <= 4 ? '#ffb020' : '#7ee08a';
        return met === 5;
      }

      /* The Security panel used to sit behind a "Verify identity" gate that
         re-ran whichever provider the account signed up with. It protected
         nothing: changing the password already requires the current password,
         and changing the email already requires confirming from the new
         inbox. All the gate did was add a round trip - and, for a Discord or
         Roblox account, a full OAuth bounce - before showing a form that
         re-checks credentials anyway. */
      function loadSecurity() {
        currentUser(function (user) {
          var emailInput = document.getElementById('sec-email');
          if (emailInput && user) emailInput.value = user.email || '';
        });
        if (typeof renderLinkedAccounts === 'function') renderLinkedAccounts();
      }

      var secEmailForm = document.getElementById('secEmailForm');
      if (secEmailForm) secEmailForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var newEmail = document.getElementById('sec-email').value.trim();
        var msgEl = secEmailForm.querySelector('.auth-msg');
        var btn = secEmailForm.querySelector('button[type="submit"]');
        setBtnLoading(btn, true);
        window.coldSupabase.auth.updateUser({ email: newEmail }).then(function (res) {
          setBtnLoading(btn, false);
          if (!msgEl) return;
          msgEl.classList.add('show');
          msgEl.textContent = res.error ? (res.error.message || 'Could not update email.') : 'Check your new email to confirm the change - it will not take effect until then.';
        });
      });

      var pwModalOverlay = document.getElementById('pwModalOverlay');
      var openPwModalBtn = document.getElementById('openPwModalBtn');
      if (openPwModalBtn && pwModalOverlay) openPwModalBtn.addEventListener('click', function () { pwModalOverlay.hidden = false; });
      var pwModalCancel = document.getElementById('pwModalCancel');
      if (pwModalCancel && pwModalOverlay) pwModalCancel.addEventListener('click', function () { pwModalOverlay.hidden = true; });
      if (pwModalOverlay) pwModalOverlay.addEventListener('click', function (e) { if (e.target === pwModalOverlay) pwModalOverlay.hidden = true; });

      var pwNewInput = document.getElementById('pw-new');
      var pwModalFill = document.getElementById('pwModalFill');
      var pwModalList = document.getElementById('pwModalChecklist');
      var pwModalBox = document.getElementById('pwModalStrength');
      if (pwNewInput && pwModalFill && pwModalList && pwModalBox) {
        pwNewInput.addEventListener('input', function () { pwModalBox.classList.add('open'); evalPwStrength(pwNewInput.value, pwModalFill, pwModalList); });
        pwNewInput.addEventListener('focus', function () { if (pwNewInput.value) pwModalBox.classList.add('open'); });
      }

      var pwChangeForm = document.getElementById('pwChangeForm');
      if (pwChangeForm) pwChangeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var current = document.getElementById('pw-current').value;
        var next = document.getElementById('pw-new').value;
        var confirmVal = document.getElementById('pw-confirm').value;
        var msgEl = pwChangeForm.querySelector('.auth-msg');
        function fieldErr(name, msg) {
          var f = pwChangeForm.querySelector('.auth-field[data-for="' + name + '"]'); if (!f) return;
          f.classList.toggle('invalid', !!msg);
          var e2 = f.querySelector('.auth-err'); if (e2) e2.textContent = msg || '';
        }
        fieldErr('current', ''); fieldErr('new', ''); fieldErr('confirm', '');
        if (!current) { fieldErr('current', 'Enter your current password.'); return; }
        if (!evalPwStrength(next, pwModalFill, pwModalList)) { fieldErr('new', 'Password does not meet all requirements.'); return; }
        if (next !== confirmVal) { fieldErr('confirm', 'Passwords do not match.'); return; }

        var btn = pwChangeForm.querySelector('button[type="submit"]');
        setBtnLoading(btn, true);
        currentUser(function (user) {
          if (!user || !user.email) { setBtnLoading(btn, false); fieldErr('current', 'Could not verify.'); return; }
          window.coldSupabase.auth.signInWithPassword({ email: user.email, password: current }).then(function (res) {
            if (res.error) { setBtnLoading(btn, false); fieldErr('current', 'Incorrect current password.'); return; }
            window.coldSupabase.auth.updateUser({ password: next }).then(function (res2) {
              setBtnLoading(btn, false);
              if (res2.error) { if (msgEl) { msgEl.classList.add('show'); msgEl.textContent = res2.error.message || 'Could not update password.'; } return; }
              pwChangeForm.reset();
              pwModalBox.classList.remove('open');
              if (msgEl) { msgEl.classList.add('show'); msgEl.textContent = 'Password updated.'; }
              setTimeout(function () { pwModalOverlay.hidden = true; if (msgEl) msgEl.classList.remove('show'); }, 1200);
            });
          });
        });
      });

      // ================================================================
      // LINKED ACCOUNTS - link/unlink the providers an account can carry.
      // ================================================================
      function renderLinkedAccounts() {
        currentUser(function (user) {
          if (!user) return;
          var identities = user.identities || [];
          var hasEmail = identities.some(function (i) { return i.provider === 'email'; });
          var discordIdentity = identities.filter(function (i) { return i.provider === 'discord'; })[0];
          document.getElementById('linkedEmailStatus').textContent = hasEmail ? 'Set - used to sign in' : 'Not set';

          var googleIdentity = identities.filter(function (i) { return i.provider === 'google'; })[0];
          var baseCount = (hasEmail ? 1 : 0) + (discordIdentity ? 1 : 0) + (googleIdentity ? 1 : 0);
          window.coldAuth.robloxLinkStatus().then(function (rres) {
            var robloxLinked = !!(rres && rres.linked);
            var totalMethods = baseCount + (robloxLinked ? 1 : 0);
            var errEl = document.getElementById('linkedErr');

            // linkIdentity() needs "Manual linking" enabled on the Supabase
            // project (Authentication -> Providers). With it off, every Link
            // button fails with a raw API string that reads like a site bug
            // rather than a setting the operator has to flip.
            function linkErr(err, provider) {
              var raw = (err && (err.message || err.msg)) || '';
              if (/manual linking is disabled/i.test(raw)) {
                return 'Linking accounts is currently turned off. Please contact support.';
              }
              return raw || ('Could not link ' + provider + '.');
            }

            var dBtn = document.getElementById('linkedDiscordBtn');
            document.getElementById('linkedDiscordStatus').textContent = discordIdentity ? 'Linked' : 'Not linked';
            dBtn.textContent = discordIdentity ? 'Unlink' : 'Link';
            dBtn.disabled = !!(discordIdentity && totalMethods <= 1);
            dBtn.title = (discordIdentity && totalMethods <= 1) ? 'This is your only sign-in method' : '';
            dBtn.onclick = function () {
              if (errEl) errEl.textContent = '';
              if (discordIdentity) {
                if (totalMethods <= 1) return;
                if (!confirm('Unlink your Discord account?')) return;
                dBtn.disabled = true;
                window.coldSupabase.auth.unlinkIdentity(discordIdentity).then(function (ures) {
                  if (errEl) errEl.textContent = ures.error ? (ures.error.message || 'Could not unlink.') : '';
                  renderLinkedAccounts();
                }).catch(function (err) {
                  dBtn.disabled = false;
                  if (errEl) errEl.textContent = (err && err.message) || 'Could not unlink Discord.';
                });
              } else {
                dBtn.disabled = true;
                window.coldSupabase.auth.linkIdentity({ provider: 'discord', options: { redirectTo: location.origin + '/dashboard?panel=account' } }).then(function (lres) {
                  dBtn.disabled = false;
                  if (lres && lres.error && errEl) errEl.textContent = linkErr(lres.error, 'Discord');
                }).catch(function (err) {
                  dBtn.disabled = false;
                  if (errEl) errEl.textContent = linkErr(err, 'Discord');
                });
              }
            };

            var gBtn = document.getElementById('linkedGoogleBtn');
            if (gBtn) {
              document.getElementById('linkedGoogleStatus').textContent = googleIdentity ? 'Linked' : 'Not linked';
              gBtn.textContent = googleIdentity ? 'Unlink' : 'Link';
              gBtn.disabled = !!(googleIdentity && totalMethods <= 1);
              gBtn.title = (googleIdentity && totalMethods <= 1) ? 'This is your only sign-in method' : '';
              gBtn.onclick = function () {
                if (errEl) errEl.textContent = '';
                if (googleIdentity) {
                  if (totalMethods <= 1) return;
                  if (!confirm('Unlink your Google account?')) return;
                  gBtn.disabled = true;
                  window.coldSupabase.auth.unlinkIdentity(googleIdentity).then(function (ures) {
                    if (errEl) errEl.textContent = ures.error ? (ures.error.message || 'Could not unlink.') : '';
                    renderLinkedAccounts();
                  }).catch(function (err) {
                    gBtn.disabled = false;
                    if (errEl) errEl.textContent = (err && err.message) || 'Could not unlink Google.';
                  });
                } else {
                  gBtn.disabled = true;
                  window.coldSupabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: location.origin + '/dashboard?panel=account' } }).then(function (lres) {
                    gBtn.disabled = false;
                    if (lres && lres.error && errEl) errEl.textContent = linkErr(lres.error, 'Google');
                  }).catch(function (err) {
                    gBtn.disabled = false;
                    if (errEl) errEl.textContent = linkErr(err, 'Google');
                  });
                }
              };
            }

            var rBtn = document.getElementById('linkedRobloxBtn');
            document.getElementById('linkedRobloxStatus').textContent = robloxLinked ? ('Linked as ' + (rres.robloxUsername || '')) : 'Not linked';
            rBtn.textContent = robloxLinked ? 'Unlink' : 'Link';
            rBtn.disabled = !!(robloxLinked && totalMethods <= 1);
            rBtn.title = (robloxLinked && totalMethods <= 1) ? 'This is your only sign-in method' : '';
            rBtn.onclick = function () {
              if (errEl) errEl.textContent = '';
              if (robloxLinked) {
                if (totalMethods <= 1) return;
                if (!confirm('Unlink your Roblox account?')) return;
                rBtn.disabled = true;
                window.coldAuth.unlinkRoblox().then(function (ures) {
                  rBtn.disabled = false;
                  if (ures && ures.ok === false && errEl) { errEl.textContent = ures.error || 'Could not unlink Roblox.'; return; }
                  renderLinkedAccounts();
                }).catch(function (err) {
                  rBtn.disabled = false;
                  if (errEl) errEl.textContent = (err && err.message) || 'Could not unlink Roblox.';
                });
              } else {
                window.coldAuth.signInRoblox('/dashboard?panel=account');
              }
            };
          });
        });
      }

      var so = document.getElementById('dashSignout');
      var soOverlay = document.getElementById('signoutOverlay');
      var soCancel = document.getElementById('signoutCancel');
      var soConfirm = document.getElementById('signoutConfirm');
      if (so && soOverlay) so.addEventListener('click', function () { soOverlay.hidden = false; });
      if (soCancel) soCancel.addEventListener('click', function () { soOverlay.hidden = true; });
      if (soOverlay) soOverlay.addEventListener('click', function (e) { if (e.target === soOverlay) soOverlay.hidden = true; });
      if (soConfirm) soConfirm.addEventListener('click', function () {
        soOverlay.hidden = true;
        setState(false);
        (window.coldAuth ? window.coldAuth.signOut() : Promise.resolve()).then(function () {
          if (window.__go) window.__go('home'); else location.href = '/';
        });
      });
    })();

    (function () {
      var root = document.querySelector('.checkout');
      window.__goCheckout = function () {
        if (root) { cart = load(); render(); }
        if (window.__go) window.__go('checkout'); else location.href = '/checkout';
      };
      if (!root) return;

      var CART_KEY = 'coldd_cart_v1';
      var money = function (n) { return window.__money ? window.__money(n) : ('$' + n); };
      // Digital licences aren't a quantity - forced to 1 here too so a cart
      // saved by an older version of this file (back when the drawer's
      // +/- stepper existed) can't still check out at qty > 1.
      function load() { try { return (JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []).map(function (i) { i.qty = 1; return i; }); } catch (e) { return []; } }
      function save(c) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) {}
        scheduleCartSnapshot();
        try { window.dispatchEvent(new CustomEvent('coldd:cart-sync', { detail: { source: 'checkout' } })); } catch (e) {}
      }
      var cart = load();
      // Same fix as the cart drawer (app.js's other IIFE): if the drawer
      // (or any other cart instance on this page) changes the cart, reload
      // from localStorage and re-render so this page never builds the
      // create-checkout-session payload from a stale snapshot.
      window.addEventListener('coldd:cart-sync', function (e) {
        if (e.detail && e.detail.source === 'checkout') return;
        cart = load();
        render();
      });

      // Abandoned-cart tracking for the admin panel - debounced so typing/
      // adjusting quantities doesn't spam the backend. Reuses the same
      // per-browser-session id catalog.js's pageview beacon already sets.
      var cartSnapshotTimer = null;
      function cartSessionId() {
        try {
          var sid = sessionStorage.getItem('coldd_session_id');
          if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('coldd_session_id', sid); }
          return sid;
        } catch (e) { return null; }
      }
      function scheduleCartSnapshot() {
        if (!window.coldAuth) return;
        // The snapshot exists for abandoned-cart follow-up in the admin panel,
        // not to make the visitor's own cart work - that is pure localStorage.
        // So it is analytics, and waits for consent.
        if (!window.coldConsent || !window.coldConsent.allows('analytics')) return;
        clearTimeout(cartSnapshotTimer);
        cartSnapshotTimer = setTimeout(function () {
          var sid = cartSessionId(); if (!sid) return;
          var items = cart.map(function (i) { return { title: i.title, image: i.image, qty: i.qty, price: i.price }; });
          window.coldAuth.invokeFn('save-cart-snapshot', { sessionId: sid, items: items, valueUsd: subtotal() }).catch(function () {});
        }, 1500);
      }
      function deleteCartSnapshot() {
        var sid = cartSessionId(); if (!sid || !window.coldAuth) return;
        window.coldAuth.invokeFn('delete-cart-snapshot', { sessionId: sid }).catch(function () {});
      }

      var itemsEl = document.getElementById('coItems'), emptyEl = document.getElementById('coEmpty');

      function subtotal() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

      // Same fix as the cart drawer (app.js's other IIFE): don't
      // estimate Robux with a flat 80-per-$1 conversion - use each
      // product's real admin-configured robux_price when set. Resell
      // licences aren't priced in Robux (matches product.html).
      // ROBUX_PER_USD_FALLBACK is `var`-scoped per IIFE (see app.js's other
      // one), so it has to be declared again here rather than shared -
      // without this line, any cart item missing a real robux_price threw
      // a ReferenceError the moment renderPayAmounts/renderRobuxEstimate
      // hit the fallback branch below.
      var ROBUX_PER_USD_FALLBACK = 80; // matches _shared/roblox.ts's ROBUX_PER_USD
      function catalogRobuxPrice(id) {
        var baseId = String(id).replace(/--resell$/, '').replace(/--bundle$/, '');
        var p = (window.__CATALOG || []).filter(function (c) { return c.id === baseId; })[0];
        // > 0, not != null: a stored robux_price of 0 is bad data, not an
        // intentional free-in-Robux price - falls back to the flat
        // estimate instead of quoting R$0 for a product that costs real
        // money, and instead of failing the whole Robux order (server
        // rejects a total <= 0) if that were the only item in the cart.
        return p && p.robuxPrice > 0 ? p.robuxPrice : null;
      }
      function lineMoney(item) {
        if (window.__currencyMode && window.__currencyMode() === 'robux' && item.licence !== 'resell') {
          var rbx = catalogRobuxPrice(item.id);
          if (rbx != null) return 'R$ ' + Math.round(rbx * item.qty).toLocaleString('en-US');
        }
        return money(item.price * item.qty);
      }
      // Raw number, not a display string - shared by subtotalMoney() below
      // and renderTotals()'s discount/total math, so a coupon's Robux
      // figures stay proportional to the REAL per-item Robux subtotal
      // shown here instead of being computed some other way.
      function robuxSubtotalRaw() {
        var total = 0, allPriced = true;
        cart.forEach(function (i) {
          var rbx = i.licence !== 'resell' ? catalogRobuxPrice(i.id) : null;
          if (rbx == null) { allPriced = false; return; }
          total += rbx * i.qty;
        });
        return allPriced ? total : null;
      }
      function subtotalMoney() {
        if (window.__currencyMode && window.__currencyMode() === 'robux') {
          var rbxTotal = robuxSubtotalRaw();
          if (rbxTotal != null) return 'R$ ' + Math.round(rbxTotal).toLocaleString('en-US');
        }
        return money(subtotal());
      }

      function cartToItems() {
        return cart.map(function (i) {
          var licence = i.id.indexOf('--resell') !== -1 ? 'resell' : 'standard';
          var slug = i.id.replace(/--resell$/, '').replace(/--bundle$/, '');
          return { slug: slug, qty: i.qty, licence: licence };
        });
      }

      // { code, discountUsd } once a code has been validated server-side via
      // validate-coupon - never computed client-side, so what's shown here
      // always matches what create-checkout-session actually charges.
      var appliedCoupon = null;
      function computeDiscount() {
        return appliedCoupon ? appliedCoupon.discountUsd : 0;
      }

      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      // The place-order button used to stay fully enabled and styled as the
      // primary action on an empty cart, while its handler bailed out on
      // `if (!cart.length) return;` — so clicking it did nothing at all and
      // said nothing about why. The empty cart is now reflected in the control.
      function syncPlaceButtonToCart() {
        var btn = document.getElementById('coPlace');
        if (!btn || btn.hidden) return;
        if (btn.getAttribute('data-busy') === '1') return;
        // A method that is disabled for its own reason keeps its own message.
        if (btn.textContent === 'Crypto checkout coming soon') return;
        if (!cart.length) {
          btn.disabled = true;
          btn.textContent = 'Your cart is empty';
        } else if (btn.textContent === 'Your cart is empty') {
          btn.disabled = false;
          btn.textContent = 'Place order';
        }
      }

      function renderItems() {
        if (!itemsEl) return;
        itemsEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = cart.length > 0;
        syncPlaceButtonToCart();
        cart.forEach(function (i) {
          var row = document.createElement('div'); row.className = 'co-item';
          // No "Qty" shown - every product is a single digital licence, not
          // a quantity, so there is never anything to count.
          var lic = i.licence === 'resell' ? '<div class="co-item-sub">Resell licence</div>' : '';
          row.innerHTML = '<span class="co-item-thumb" style="background-image:url(\'' + i.image + '\')"></span>' +
            '<div class="co-item-info"><div class="co-item-title">' + esc(i.title) + '</div>' + lic + '</div>' +
            '<span class="co-item-price">' + lineMoney(i) + '</span>';
          itemsEl.appendChild(row);
        });
      }
      function renderTotals() {
        var sub = subtotal();
        var disc = computeDiscount(sub);
        var total = Math.max(0, sub - disc);
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
        set('coSubtotal', subtotalMoney());
        // A coupon's discountUsd is a flat USD figure, no matter the display
        // currency - converting it (and the total) through money()'s generic
        // flat exchange rate produced a Robux discount with no relationship
        // to the REAL, per-item Robux subtotal already on screen (each
        // product's actual robux_price is set independently by an admin,
        // often nowhere near what a flat USD conversion would suggest) -
        // a $24 discount at the flat rate could show as -R$1,944 sitting
        // under a R$13 subtotal. Scaling the discount by the same fraction
        // of the REAL Robux subtotal keeps every figure on this page
        // proportionally consistent with each other, in Robux mode.
        var robuxMode = window.__currencyMode && window.__currencyMode() === 'robux';
        var rbxSub = robuxMode ? robuxSubtotalRaw() : null;
        var discLine = document.getElementById('coDiscLine');
        if (discLine) {
          discLine.hidden = disc <= 0;
          if (disc > 0) {
            set('coDiscLabel', 'Discount (' + appliedCoupon.code + ')');
            if (rbxSub != null && sub > 0) {
              set('coDiscAmt', '-R$ ' + Math.round(rbxSub * (disc / sub)).toLocaleString('en-US'));
            } else {
              set('coDiscAmt', '-' + money(disc));
            }
          }
        }
        // Tax is not currently charged on any order. The row stays hidden
        // rather than showing a permanent zero; when tax does apply, set the
        // value and unhide in one place.
        var taxLine = document.getElementById('coTaxLine');
        if (taxLine) taxLine.hidden = true;
        set('coTax', money(0));
        if (rbxSub != null) {
          var rbxTotal = disc > 0 && sub > 0 ? Math.max(0, rbxSub - rbxSub * (disc / sub)) : rbxSub;
          set('coTotal', 'R$ ' + Math.round(rbxTotal).toLocaleString('en-US'));
        } else {
          set('coTotal', disc > 0 ? money(total) : subtotalMoney());
        }
        renderPayAmounts(total);
        return total;
      }

      // Each method shows the SAME order total expressed in its own unit. The
      // amount that actually leaves the account is always the flat USD figure -
      // stated once, below the list, rather than repeated four times.
      function renderPayAmounts(total) {
        var usd = window.__usd ? window.__usd(total) : ('$' + total);
        var fiat = window.__fiat ? window.__fiat(total) : usd;

        function set(key, v) {
          var el = document.querySelector('[data-pay-amt="' + key + '"]');
          if (el) el.textContent = v;
        }
        // Card and PayPal both settle in fiat, so both show the buyer's
        // selected currency.
        set('stripe', fiat);
        set('paypal', fiat);
        // Crypto shows the same fiat reference figure as card/PayPal, not a
        // coin amount - the BTC/ETH quantity is only known once the payment
        // processor quotes it live on its own checkout page, and printing
        // one here would be a number we invented. That's a different thing
        // from which currency the reference figure itself is in though:
        // this used to hardcode USD regardless of the buyer's selected
        // display currency, so switching to GBP converted every other
        // method but silently left crypto in USD - not a currency-specific
        // limitation, just this line never being updated to match.
        set('crypto', fiat);
        // Sums each item's REAL robux_price where one is set, falling back
        // to the flat 80-per-$1 estimate only per-item, not for the whole
        // row - matches priceRobuxItems' server-side math exactly. This
        // used to flat-convert the order's USD total in one shot
        // (window.__robux(total)), which showed a different number here
        // than the actual Robux panel below once any cart item had a real
        // robux_price - the classic "why does checkout show two different
        // Robux prices" report.
        var robuxRow = 0;
        cart.forEach(function (i) {
          if (i.licence === 'resell') return; // never sold in Robux, matches priceRobuxItems
          var rbx = catalogRobuxPrice(i.id);
          if (rbx == null) rbx = Math.round(i.price * ROBUX_PER_USD_FALLBACK);
          robuxRow += rbx * i.qty;
        });
        set('robux', 'R$ ' + Math.round(robuxRow).toLocaleString('en-US'));

        // Card and PayPal both settle in USD at a rate their own processor
        // fixes at the moment of charge - crypto and Robux settle in
        // whatever the buyer actually sent/bought, converted well before
        // checkout, so this line's "what actually leaves your account"
        // framing only applies to the first two.
        var settle = document.getElementById('coPaySettle');
        if (!settle) return;
        var showSettle = payMethod === 'stripe' || payMethod === 'paypal';
        settle.hidden = !showSettle;
        if (showSettle) settle.textContent = 'Every payment method settles in USD price (' + usd + ').';
      }
      function render() {
        renderItems(); renderTotals(); updateResell();
        if (typeof payMethod !== 'undefined' && payMethod === 'robux') renderRobuxPanel();
      }

      function updateResell() {
        var wrap = document.getElementById('coResellWrap');
        if (wrap) wrap.hidden = !cart.some(function (i) { return i.licence === 'resell'; });
      }

      var loggedIn = false;
      var g = document.getElementById('coGuest'), u = document.getElementById('coUser');
      function applySessionUI() {
        if (g) g.hidden = loggedIn;
        if (u) u.hidden = !loggedIn;
      }
      function refreshSession() {
        if (!window.coldSupabase) { loggedIn = false; applySessionUI(); return; }
        window.coldSupabase.auth.getSession().then(function (res) {
          var session = res && res.data ? res.data.session : null;
          loggedIn = !!session;
          applySessionUI();
        }).catch(function () { loggedIn = false; applySessionUI(); });
      }
      refreshSession();
      if (window.coldSupabase) window.coldSupabase.auth.onAuthStateChange(function () { refreshSession(); });

      var coSigninBtn = document.getElementById('coSigninBtn');
      if (coSigninBtn) coSigninBtn.addEventListener('click', function () { location.href = '/signin'; });

      var couponInput = document.getElementById('coCouponInput'), couponApplyBtn = document.getElementById('coCouponApply'), couponMsg = document.getElementById('coCouponMsg');
      if (couponApplyBtn) couponApplyBtn.addEventListener('click', function () {
        var code = (couponInput && couponInput.value || '').trim().toUpperCase();
        if (!code || !cart.length || !window.coldSupabase) return;
        couponApplyBtn.disabled = true;
        window.coldSupabase.functions.invoke('validate-coupon', { body: { code: code, items: cartToItems() } })
          .then(function (res) {
            couponApplyBtn.disabled = false;
            var data = res && res.data, error = res && res.error;
            if (error || !data || !data.ok) {
              appliedCoupon = null;
              if (couponMsg) { couponMsg.className = 'co-coupon-msg no'; couponMsg.textContent = (data && data.error) || 'That code is invalid or no longer active.'; }
            } else {
              appliedCoupon = { code: data.code, discountUsd: data.discountUsd };
              if (couponMsg) { couponMsg.className = 'co-coupon-msg ok'; couponMsg.textContent = 'Code "' + data.code + '" applied!'; }
            }
            renderTotals();
          })
          .catch(function () {
            couponApplyBtn.disabled = false;
            appliedCoupon = null;
            if (couponMsg) { couponMsg.className = 'co-coupon-msg no'; couponMsg.textContent = 'Could not check that code. Please try again.'; }
            renderTotals();
          });
      });

      // Robux checkout never goes through Stripe - Roblox handles the
      // actual payment when the buyer purchases each gamepass on
      // Roblox's own site. This panel: link Roblox account if needed ->
      // create a pending order (which hands back each item's gamepass
      // ID) -> "Buy on Roblox" links per item -> verify against the
      // buyer's inventory. robuxOrderId is reused across tab switches as
      // long as the cart hasn't changed since it was created (tracked via
      // robuxOrderSignature below) - editing the cart after opening this
      // tab starts a fresh order instead of verifying against stale items.
      var robuxOrderId = null;
      var robuxOrderItems = null;
      var robuxOrderSignature = null;
      var robuxOrderGamePassId = null;
      var robuxOrderPriceRobux = null;
      function robuxItemsSignature(items) {
        return JSON.stringify(items.map(function (i) { return [i.slug, i.qty, i.licence]; }).sort());
      }
      // The panel itself is purely informational now - it shows the buyer
      // what they're about to pay in Robux and whether their account is
      // linked, but no order is created until they click Place order. That
      // matches every other payment method (nothing is created on tab
      // select) and means a buyer who switches methods a few times while
      // deciding never leases (and holds hostage) a pool pass they haven't
      // committed to yet.
      function renderRobuxPanel() {
        var resellBlock = document.getElementById('coRobuxResellBlock');
        var linkBlock = document.getElementById('coRobuxLinkBlock');
        var buyBlock = document.getElementById('coRobuxBuyBlock');
        if (!resellBlock || !linkBlock || !buyBlock) return;

        // Robux pricing doesn't support resell licences (matches
        // product.html) - resell items just aren't part of the Robux
        // order, not a hard block on the whole cart. Only fully block if
        // EVERY item in the cart is resell (nothing left to buy via Robux).
        // Derived from the id suffix, same as cartToItems() below, NOT
        // trusted off item.licence directly - a cart hydrated from an
        // older localStorage snapshot can have items whose id already
        // carries the --resell suffix but whose licence field was never
        // set, which would have let a resell item slip into the Robux
        // estimate and (had cartToItems used the same shortcut) the order.
        var isRobuxEligible = function (i) { return i.id.indexOf('--resell') === -1; };
        var robuxCartItems = cart.filter(isRobuxEligible);
        var robuxItems = cartToItems().filter(function (i) { return i.licence !== 'resell'; });
        var hasResell = robuxItems.length !== cart.length;
        resellBlock.hidden = !hasResell;
        linkBlock.hidden = true;
        buyBlock.hidden = true;
        if (!robuxItems.length || !window.coldAuth) return;

        // A cart edit invalidates any order already leased for the old
        // items - the next Place order click has to lease fresh rather than
        // reuse a pass priced for a cart that no longer exists.
        var signature = robuxItemsSignature(robuxItems);
        if (robuxOrderSignature && robuxOrderSignature !== signature) {
          robuxOrderId = null;
          robuxOrderItems = null;
          robuxOrderSignature = null;
          robuxOrderGamePassId = null;
          robuxOrderPriceRobux = null;
        }

        window.coldAuth.robloxLinkStatus().then(function (res) {
          // Only gates on "linked" here, NOT hasInventoryScope. That flag
          // reads false for any account linked before scope tracking
          // existed (which is most of them), even though their token
          // almost certainly already has the permission - Roblox's OAuth
          // consent is all-or-nothing, so anyone who got through it at all
          // has whatever was being requested at the time. The real check
          // happens server-side against the buyer's live inventory when
          // Place order is clicked; only THAT failing (see startRobuxOrder)
          // means a re-link is actually necessary.
          if (!res || !res.linked) {
            linkBlock.hidden = false;
            updateRobuxLinkCopy(false);
            return;
          }
          buyBlock.hidden = false;
          renderRobuxEstimate(robuxCartItems);
        }).catch(function () { linkBlock.hidden = false; updateRobuxLinkCopy(false); });
      }
      // Same link block, two reasons to show it: never linked at all, vs
      // linked but the live inventory check at order-creation time came
      // back insufficient-scope. Both need the buyer to go through
      // Roblox's OAuth screen again - re-linking always overwrites the
      // stored scope with whatever was granted this time.
      function updateRobuxLinkCopy(needsRelink) {
        var hint = document.getElementById('coRobuxLinkHint');
        var btn = document.getElementById('coRobuxLinkBtn');
        if (hint) {
          hint.textContent = needsRelink
            ? "Robux checkout needs permission to check your Roblox inventory, which your current link doesn't have. Re-link your account to grant it - you'll sign in on roblox.com and come straight back here."
            : "Link your Roblox account to pay with Robux; we verify your purchase against the Roblox account you link. You'll sign in on roblox.com and come straight back here; if you're signed out of Roblox it will ask you to log in first.";
        }
        if (btn) btn.textContent = needsRelink ? 'Re-link Roblox account' : 'Continue to Roblox';
      }
      // Client-side estimate shown before an order exists, using each
      // product's real robux_price the same way the payment-method row
      // above does - so this number and the modal's later real total agree
      // whenever nothing about the cart's pricing is in flux.
      //
      // Only the total - this used to also re-list every item with its own
      // Robux price, right below the Order summary sidebar that's already
      // listing the exact same items (in Robux too, whenever that's the
      // active display currency, which anyone paying in Robux almost
      // always has selected). Two identical item lists stacked on one page
      // read as a bug, not as two different pieces of information.
      function renderRobuxEstimate(robuxCartItems) {
        var totalEl = document.getElementById('coRobuxTotal');
        var total = 0;
        robuxCartItems.forEach(function (i) {
          var rbx = catalogRobuxPrice(i.id);
          if (rbx == null) rbx = Math.round(i.price * ROBUX_PER_USD_FALLBACK);
          total += rbx * i.qty;
        });
        if (totalEl) totalEl.textContent = 'R$ ' + Math.round(total).toLocaleString('en-US');
      }
      var robuxLinkBtn = document.getElementById('coRobuxLinkBtn');
      // Come back to checkout with Robux still selected, rather than landing
      // on the dashboard with a half-finished order behind you.
      if (robuxLinkBtn) robuxLinkBtn.addEventListener('click', function () {
        if (window.coldAuth) window.coldAuth.signInRoblox('/checkout?method=robux');
      });

      // ---- Robux purchase modal: Place order -> instructions -> continuous
      // verification polling until paid, switched, or timed out. ----
      var robuxModalOverlay = document.getElementById('robuxModalOverlay');
      var robuxModalClose = document.getElementById('robuxModalClose');
      var robuxModalSteps = document.getElementById('robuxModalSteps');
      var robuxModalTotal = document.getElementById('robuxModalTotal');
      var robuxModalBuyBtn = document.getElementById('robuxModalBuyBtn');
      var robuxModalConfirmBtn = document.getElementById('robuxModalConfirmBtn');
      var robuxModalWaiting = document.getElementById('robuxModalWaiting');
      var robuxModalStatusText = document.getElementById('robuxModalStatusText');
      var robuxModalHint = document.getElementById('robuxModalHint');
      var robuxModalCancelWait = document.getElementById('robuxModalCancelWait');
      var robuxModalDone = document.getElementById('robuxModalDone');
      var robuxModalDoneMsg = document.getElementById('robuxModalDoneMsg');
      var robuxModalRetryBtn = document.getElementById('robuxModalRetryBtn');

      var robuxPollTimer = null;
      var robuxPollDeadline = 0;
      var ROBUX_POLL_INTERVAL_MS = 5000;
      var ROBUX_POLL_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes of continuous checking before asking the buyer to retry manually

      function updateRobuxModalBuyLink() {
        if (robuxModalTotal) robuxModalTotal.textContent = robuxOrderPriceRobux != null ? 'R$ ' + robuxOrderPriceRobux.toLocaleString('en-US') : '—';
        if (robuxModalBuyBtn) {
          if (robuxOrderGamePassId) {
            robuxModalBuyBtn.href = 'https://www.roblox.com/game-pass/' + robuxOrderGamePassId + '/';
            robuxModalBuyBtn.setAttribute('aria-disabled', 'false');
          } else {
            robuxModalBuyBtn.href = '#';
            robuxModalBuyBtn.setAttribute('aria-disabled', 'true');
          }
        }
      }
      function showRobuxModalPane(pane) {
        if (robuxModalSteps) robuxModalSteps.hidden = pane !== 'steps';
        if (robuxModalWaiting) robuxModalWaiting.hidden = pane !== 'waiting';
        if (robuxModalDone) robuxModalDone.hidden = pane !== 'done';
      }
      function stopRobuxPolling() {
        if (robuxPollTimer) { clearTimeout(robuxPollTimer); robuxPollTimer = null; }
      }
      function openRobuxModal() {
        if (!robuxModalOverlay) return;
        updateRobuxModalBuyLink();
        showRobuxModalPane('steps');
        robuxModalOverlay.hidden = false;
      }
      function closeRobuxModal() {
        if (!robuxModalOverlay) return;
        stopRobuxPolling();
        robuxModalOverlay.hidden = true;
      }
      if (robuxModalClose) robuxModalClose.addEventListener('click', closeRobuxModal);
      if (robuxModalOverlay) robuxModalOverlay.addEventListener('click', function (e) {
        if (e.target === robuxModalOverlay) closeRobuxModal();
      });
      if (robuxModalCancelWait) robuxModalCancelWait.addEventListener('click', function () {
        stopRobuxPolling();
        showRobuxModalPane('steps');
      });
      if (robuxModalRetryBtn) robuxModalRetryBtn.addEventListener('click', function () {
        showRobuxModalPane('steps');
      });

      function finishRobuxWait(success, message) {
        showRobuxModalPane('done');
        if (robuxModalDoneMsg) {
          robuxModalDoneMsg.className = 'robux-modal-msg' + (success ? '' : ' err');
          robuxModalDoneMsg.textContent = message;
        }
      }
      function scheduleRobuxPoll() {
        if (Date.now() >= robuxPollDeadline) {
          finishRobuxWait(false, "We haven't been able to confirm your purchase yet. If you've already bought the gamepass, Roblox can occasionally take longer to report it - try again below.");
          return;
        }
        robuxPollTimer = setTimeout(pollRobuxOrder, ROBUX_POLL_INTERVAL_MS);
      }
      // Runs on a loop (not on a click) until the order is paid, its lease
      // expires, verification fails closed, or the overall timeout passes -
      // the buyer only ever has to click "I've purchased" once.
      function pollRobuxOrder() {
        if (!robuxOrderId || !window.coldAuth) return;
        window.coldAuth.invokeFn('verify-robux-order', { orderId: robuxOrderId }).then(function (data) {
          if (data.verified) {
            stopRobuxPolling();
            var paidOrderId = robuxOrderId;
            // Belt-and-suspenders alongside removing the reuse shortcut
            // above: clear it the moment we know it's paid, so nothing
            // left in memory could point back at an already-owned pass if
            // this script instance somehow runs again (bfcache restore)
            // before actually navigating away.
            robuxOrderId = null; robuxOrderItems = null; robuxOrderSignature = null; robuxOrderGamePassId = null; robuxOrderPriceRobux = null;
            location.href = '/success?order_id=' + encodeURIComponent(paidOrderId);
            return;
          }
          if (data.code === 'PASS_SWITCHED') {
            // Buyer already owned the pass they were leased - the backend
            // has already released it and leased a fresh one for this same
            // order. Point the buy link at the new pass and keep polling
            // automatically, no re-click needed.
            robuxOrderGamePassId = data.gamePassId;
            robuxOrderPriceRobux = data.priceRobux;
            updateRobuxModalBuyLink();
            if (robuxModalStatusText) robuxModalStatusText.textContent = 'You already owned that gamepass - switched you to a new one.';
            if (robuxModalHint) robuxModalHint.textContent = "Buy the updated gamepass linked above, then we'll keep checking automatically.";
            scheduleRobuxPoll();
            return;
          }
          if (data.code === 'LEASE_EXPIRED') {
            stopRobuxPolling();
            robuxOrderId = null; robuxOrderItems = null; robuxOrderSignature = null; robuxOrderGamePassId = null; robuxOrderPriceRobux = null;
            finishRobuxWait(false, data.message || "This order's payment window expired. Please start the order again - you have not been charged.");
            return;
          }
          // Ledger just doesn't show it yet - keep checking.
          if (robuxModalStatusText) robuxModalStatusText.textContent = 'Still checking…';
          scheduleRobuxPoll();
        }).catch(function (err) {
          // Every thrown case here (NOT_LINKED, order not found/not yours,
          // VERIFY_UNAVAILABLE, ALREADY_OWNED_NO_REPLACEMENT, server error)
          // is a real stop condition, not "not found yet" - that case
          // resolves above with ok:true instead of throwing. Stop and let
          // the buyer retry manually rather than looping on something that
          // will never resolve itself.
          stopRobuxPolling();
          finishRobuxWait(false, (err && err.message) || 'Could not check your purchase. Please try again.');
        });
      }
      if (robuxModalConfirmBtn) robuxModalConfirmBtn.addEventListener('click', function () {
        showRobuxModalPane('waiting');
        if (robuxModalStatusText) robuxModalStatusText.textContent = 'Checking for your purchase…';
        if (robuxModalHint) robuxModalHint.textContent = "This can take a minute or two - we're checking automatically, you don't need to do anything else.";
        robuxPollDeadline = Date.now() + ROBUX_POLL_TIMEOUT_MS;
        pollRobuxOrder();
      });

      var payMethod = 'stripe';
      var payMethodsWrap = document.getElementById('coPayMethods');
      function setPayMethod(key) {
        var btns = payMethodsWrap ? payMethodsWrap.querySelectorAll('.co-pay-btn') : [];
        var picked = null;
        btns.forEach(function (b) {
          var isMatch = b.getAttribute('data-key') === key;
          b.classList.toggle('active', isMatch);
          if (isMatch) picked = b;
        });
        var method = picked ? picked.getAttribute('data-method') : 'stripe';
        payMethod = method;
        document.querySelectorAll('.co-pay-panel').forEach(function (p) {
          p.hidden = p.getAttribute('data-method-panel') !== method;
        });
        var placeBtnEl = document.getElementById('coPlace');
        if (placeBtnEl) {
          // Explicit per method. This used to be an if/else-if/else where the
          // final branch caught everything that wasn't Stripe or Robux and
          // labelled it "Crypto checkout coming soon" - so adding any new
          // method silently inherited the crypto copy.
          if (method === 'stripe' || method === 'paypal' || method === 'robux') {
            placeBtnEl.hidden = false; placeBtnEl.disabled = false;
            placeBtnEl.textContent = 'Place order';
            syncPlaceButtonToCart();
          } else if (method === 'crypto') {
            placeBtnEl.hidden = false; placeBtnEl.disabled = false;
            placeBtnEl.textContent = 'Place order';
            syncPlaceButtonToCart();
          } else {
            placeBtnEl.hidden = false; placeBtnEl.disabled = true;
            placeBtnEl.textContent = 'Unavailable';
          }
        }
        if (method === 'robux') renderRobuxPanel();
        // The settle line under the payment methods only applies to card/
        // PayPal - re-run so it shows/hides for the method just picked
        // instead of only reflecting whatever was selected on page load.
        renderTotals();
        // Selection is exposed to assistive tech, not just painted. The row
        // group is a radiogroup, so each row has to carry its own state.
        document.querySelectorAll('.co-pay-btn').forEach(function (b) {
          b.setAttribute('aria-checked', b.classList.contains('active') ? 'true' : 'false');
        });
      }
      if (payMethodsWrap) payMethodsWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('.co-pay-btn'); if (!btn) return;
        setPayMethod(btn.getAttribute('data-key'));
      });
      // ?method= lets a round trip land back on the method it left from -
      // notably returning from Roblox OAuth after linking to pay in Robux.
      // Validated against the rendered buttons so an arbitrary value cannot
      // select a method that does not exist.
      var requestedMethod = new URLSearchParams(location.search).get('method');
      var methodExists = requestedMethod && payMethodsWrap &&
        payMethodsWrap.querySelector('.co-pay-btn[data-key="' + CSS.escape(requestedMethod) + '"]');
      setPayMethod(methodExists ? requestedMethod : 'stripe');

      var placeBtn = document.getElementById('coPlace'), msg = document.getElementById('coMsg'), agreeErr = document.getElementById('coAgreeErr');
      // Robux never goes through create-checkout-session - it leases a pool
      // pass and opens the instructions modal instead of redirecting.
      function startRobuxOrder() {
        if (!window.coldAuth) return;
        window.coldAuth.robloxLinkStatus().then(function (res) {
          // Only "linked" gates here - see renderRobuxPanel for why
          // hasInventoryScope isn't trusted as a hard requirement
          // client-side. create-robux-order's own live check is what
          // actually enforces this, below.
          if (!res || !res.linked) {
            renderRobuxPanel();
            if (msg) { msg.className = 'co-msg err show'; msg.textContent = 'Link your Roblox account first.'; }
            return;
          }
          var robuxItems = cartToItems().filter(function (i) { return i.licence !== 'resell'; });
          if (!robuxItems.length) {
            if (msg) { msg.className = 'co-msg err show'; msg.textContent = 'Your cart has nothing that can be bought with Robux.'; }
            return;
          }
          // Used to reuse robuxOrderId here instead of leasing fresh on
          // every click - but that trusted in-memory state indefinitely,
          // with nothing marking it stale once the order it pointed to
          // was actually paid. Browser back/forward can restore a
          // checkout tab's JS state (bfcache) without re-running this
          // script, so landing back here right after a successful
          // purchase could reopen the modal on the SAME gamepass the
          // buyer had just bought - the one thing the live pre-check in
          // create-robux-order exists to prevent, bypassed entirely
          // because this shortcut never called it again. Always leasing
          // fresh costs one extra pool lease (self-expires in 15 minutes
          // if unused) in exchange for the pre-check running every time,
          // which is the only thing actually worth optimizing away that
          // risk for.
          var signature = robuxItemsSignature(robuxItems);
          var prevText = placeBtn.textContent;
          placeBtn.setAttribute('data-busy', '1');
          placeBtn.disabled = true; placeBtn.textContent = 'Preparing your order…';
          if (msg) { msg.className = 'co-msg'; msg.textContent = ''; }
          var robuxOrderBody = { items: robuxItems };
          if (window.coldAuth.getCampaignCode()) robuxOrderBody.campaignCode = window.coldAuth.getCampaignCode();
          // Matches the Stripe/PayPal/crypto path - create-robux-order
          // re-validates the code server-side the same way those do, this
          // just tells it which one to check.
          if (appliedCoupon) robuxOrderBody.couponCode = appliedCoupon.code;
          window.coldAuth.invokeFn('create-robux-order', robuxOrderBody).then(function (data) {
            robuxOrderId = data.orderId;
            robuxOrderItems = data.items;
            robuxOrderSignature = signature;
            // The pass to actually buy - one leased pass covering the whole
            // order, priced to its exact total. Per-item gamepass IDs don't
            // exist under the pool model, so this is the only purchasable
            // link; see roblox_pool.ts.
            robuxOrderGamePassId = data.gamePassId;
            robuxOrderPriceRobux = data.priceRobux;
            deleteCartSnapshot();
            placeBtn.removeAttribute('data-busy');
            placeBtn.disabled = false; placeBtn.textContent = prevText;
            openRobuxModal();
          }).catch(function (err) {
            placeBtn.removeAttribute('data-busy');
            placeBtn.disabled = false; placeBtn.textContent = prevText;
            if (msg) { msg.className = 'co-msg err show'; msg.textContent = (err && err.message) || 'Could not start Robux checkout.'; }
            // create-robux-order's own live inventory check is the actual
            // authority on whether a re-link is needed (see its comments) -
            // only switch to the link block when THAT specifically failed,
            // not on every error, so a transient/unrelated failure doesn't
            // yank the buy block out from under someone who was fine.
            if (err && (err.code === 'INVENTORY_SCOPE_REQUIRED' || err.code === 'NOT_LINKED')) {
              var linkBlockEl = document.getElementById('coRobuxLinkBlock');
              var buyBlockEl = document.getElementById('coRobuxBuyBlock');
              if (linkBlockEl) linkBlockEl.hidden = false;
              if (buyBlockEl) buyBlockEl.hidden = true;
              updateRobuxLinkCopy(err.code === 'INVENTORY_SCOPE_REQUIRED');
            }
          });
        }).catch(function () {
          if (msg) { msg.className = 'co-msg err show'; msg.textContent = 'Could not check your Roblox account link.'; }
        });
      }
      if (placeBtn) placeBtn.addEventListener('click', function () {
        if (!cart.length) return;
        // Card, PayPal and Robux all place an order from this button; they
        // differ only in what happens after. Crypto drives its own panel
        // and never reaches here.
        if (payMethod !== 'stripe' && payMethod !== 'paypal' && payMethod !== 'crypto' && payMethod !== 'robux') return;

        // Signing in is optional - a guest can check out fine (create-checkout-session
        // leaves orders.user_id null for them); this just ties the order to an
        // account when one exists, for dashboard history and easier redownloads.
        // Robux is the one method that requires a signed-in, Roblox-linked
        // account (startRobuxOrder checks that), since Roblox has no guest
        // concept to buy a gamepass under.

        var tos = document.getElementById('coTos'), resellWrap = document.getElementById('coResellWrap'), resell = document.getElementById('coResell');
        var ok = true, agreeMsgs = [];
        if (tos && !tos.checked) { ok = false; agreeMsgs.push('accept the Terms of Service'); }
        if (resellWrap && !resellWrap.hidden && resell && !resell.checked) { ok = false; agreeMsgs.push('accept the Resell Licence Terms'); }
        if (agreeErr) agreeErr.textContent = agreeMsgs.length ? 'Please ' + agreeMsgs.join(' and ') + '.' : '';
        if (!ok) { if (msg) { msg.className = 'co-msg err show'; msg.textContent = 'Please fix the highlighted fields above.'; } return; }

        if (payMethod === 'robux') { startRobuxOrder(); return; }

        var prevText = placeBtn.textContent;
        placeBtn.setAttribute('data-busy', '1');
        placeBtn.disabled = true; placeBtn.textContent = 'Redirecting to secure checkout…';
        if (msg) { msg.className = 'co-msg'; msg.textContent = ''; }

        var checkoutBody = { items: cartToItems() };
        if (appliedCoupon) checkoutBody.couponCode = appliedCoupon.code;
        if (window.coldAuth && window.coldAuth.getCampaignCode()) checkoutBody.campaignCode = window.coldAuth.getCampaignCode();

        // Only slugs, quantities and a coupon code are ever sent. Both
        // functions re-price the whole cart from the database, so a tampered
        // request buys nothing at the wrong price.
        var checkoutFn = payMethod === 'paypal' ? 'create-paypal-order'
          : payMethod === 'crypto' ? 'create-crypto-charge'
          : 'create-checkout-session';

        window.coldSupabase.functions.invoke(checkoutFn, { body: checkoutBody })
          .then(function (res) {
            var data = res && res.data, error = res && res.error;
            if (error || !data || !data.ok) {
              // On a non-2xx the SDK reports only "Edge Function returned a
              // non-2xx status code" and leaves data null, hiding the actual
              // reason. The response body is on error.context, so read it and
              // surface the server's own message instead.
              if (error && error.context && typeof error.context.json === 'function') {
                return error.context.json()
                  .catch(function () { return null; })
                  .then(function (parsed) {
                    throw new Error((parsed && parsed.error) || error.message || 'Could not start checkout.');
                  });
              }
              throw new Error((data && data.error) || (error && error.message) || 'Could not start checkout.');
            }
            deleteCartSnapshot();
            location.href = data.url;
          })
          .catch(function (err) {
            placeBtn.removeAttribute('data-busy');
            placeBtn.disabled = false; placeBtn.textContent = prevText;
            if (msg) { msg.className = 'co-msg err show'; msg.textContent = (err && err.message) || 'Something went wrong. Please try again.'; }
          });
      });

      // The real Place order button sits at the end of a long left column
      // (Contact -> Payment -> Before you pay), often a full scroll away
      // from where the buyer actually is once they're reading through
      // payment method details. The sticky Order summary card is already
      // on screen regardless of scroll position, so it gets its own copy
      // of the button that just mirrors and forwards to the real one -
      // this observes disabled/text/hidden instead of duplicating every
      // place those are set (busy states, method switches, validation
      // errors, etc.) so it can never silently drift out of sync with the
      // button it's standing in for.
      var placeBtnSide = document.getElementById('coPlaceSide');
      if (placeBtnSide && placeBtn) {
        var syncSideBtn = function () {
          placeBtnSide.disabled = placeBtn.disabled;
          placeBtnSide.textContent = placeBtn.textContent;
          placeBtnSide.hidden = placeBtn.hidden;
        };
        syncSideBtn();
        new MutationObserver(syncSideBtn).observe(placeBtn, {
          attributes: true, attributeFilter: ['disabled', 'hidden'],
          childList: true, characterData: true, subtree: true
        });
        placeBtnSide.addEventListener('click', function () { placeBtn.click(); });
      }

      window.addEventListener('currencychange', function () { renderTotals(); renderItems(); });
      if (cart.length) scheduleCartSnapshot();
      render();
    })();



    (function () {
      var root = document.querySelector('.success-page');
      if (!root) return;

      var itemsEl = document.getElementById('successItems');
      var titleEl = document.getElementById('successTitle');
      var subEl = document.getElementById('successSub');
      var markEl = document.getElementById('successMark');
      // The tick only turns green once the order actually reads as paid.
      // Showing it on arrival would claim success while a PayPal capture or a
      // crypto confirmation is still outstanding, which is exactly the state
      // where the buyer most needs the truth.
      var tyRoot = document.getElementById('tyRoot');
      function mark(state) {
        if (markEl) markEl.setAttribute('data-state', state);
        // The "what happens next" steps talk about download buttons that only
        // exist once the order reads as paid, so they stay out of the way
        // until then rather than instructing the buyer to click nothing.
        if (tyRoot) tyRoot.setAttribute('data-state', state);
      }
      var sessionId = new URLSearchParams(location.search).get('session_id');
      var robuxOrderIdParam = new URLSearchParams(location.search).get('order_id');
      // PayPal returns here after approval. Approval is NOT payment - the
      // capture below is what actually moves the money, so this page must run
      // it before it can honestly say the order is paid.
      var paypalOrderIdParam = new URLSearchParams(location.search).get('provider') === 'paypal'
        ? new URLSearchParams(location.search).get('orderId')
        : null;
      // Crypto returns here too, but must NEVER capture from the browser: the
      // payment confirms on-chain minutes later, often after the buyer has
      // gone, so the signed webhook is the only thing allowed to mark it paid.
      // This page just polls and reports what the order row says.
      var cryptoOrderIdParam = new URLSearchParams(location.search).get('provider') === 'crypto'
        ? new URLSearchParams(location.search).get('orderId')
        : null;
      // Downstream polling looks orders up the same way for all of them, so
      // fold whichever id we got into the generic order-id slot.
      if (!robuxOrderIdParam) robuxOrderIdParam = paypalOrderIdParam || cryptoOrderIdParam;

      try { localStorage.setItem('coldd_cart_v1', '[]'); } catch (e) {}
      window.dispatchEvent(new Event('currencychange'));

      function renderItems(items) {
        if (!itemsEl) return;
        itemsEl.innerHTML = '';
        items.forEach(function (it) {
          // order_items only stores slug/title/qty/licence, not an image -
          // the catalog (already loaded for pricing elsewhere on the site)
          // is the source of truth for that, matched by slug.
          var catEntry = (window.__CATALOG || []).filter(function (c) { return c.id === it.product_slug; })[0];
          var thumb = catEntry && catEntry.image ? catEntry.image : '';
          var card = document.createElement('div');
          card.className = 'dash-card glass dl-item';
          card.innerHTML =
            '<div class="dl-top"><span class="dl-thumb" style="background-image:url(\'' + thumb + '\')"></span>' +
            '<div class="dl-info"><div class="dl-name"></div><div class="dl-meta"></div></div>' +
            '<div class="dl-actions"><a class="btn btn-ghost dl-review" href="/product?id=' + encodeURIComponent(it.product_slug) + '&tab=reviews">Leave a review</a>' +
            '<button class="btn btn-primary dl-get" type="button">Download</button></div></div>';
          card.querySelector('.dl-name').textContent = it.title;
          // No "Qty" - every product is a single digital licence, never a
          // quantity.
          card.querySelector('.dl-meta').textContent = it.licence === 'resell' ? 'Resell licence' : 'Standard licence';
          var btn = card.querySelector('.dl-get');
          btn.addEventListener('click', function () {
            var prev = btn.textContent;
            btn.disabled = true; btn.textContent = 'Preparing…';
            window.coldSupabase.functions.invoke('get-download-url', { body: { slug: it.product_slug, sessionId: sessionId } })
              .then(function (res) {
                var data = res && res.data;
                if (data && data.ok) { window.open(data.url, '_blank', 'noopener'); btn.disabled = false; btn.textContent = prev; }
                else { btn.textContent = (data && data.error) || 'Could not get download.'; }
              })
              .catch(function () { btn.disabled = false; btn.textContent = prev; });
          });
          itemsEl.appendChild(card);
        });
      }

      var tyRetryBtn = document.getElementById('tyRetryBtn');
      function poll(triesLeft) {
        if (!sessionId && !robuxOrderIdParam) { if (subEl) subEl.textContent = 'No order found.'; return; }
        if (!window.coldSupabase) { if (subEl) subEl.textContent = 'Could not connect. Please refresh.'; return; }
        // Looked up by Stripe session id (or, for Robux orders with no
        // Stripe session at all, the order id) via a service-role function,
        // not a direct table read - a guest order has no user_id for RLS to
        // match, so this is the only way (guest or signed-in) to see it
        // right after paying.
        window.coldSupabase.functions.invoke('get-order-by-session', { body: sessionId ? { sessionId: sessionId } : { orderId: robuxOrderIdParam } })
          .then(function (res) {
            var data = res && res.data;
            if (!data || !data.ok) {
              if (triesLeft > 0) { setTimeout(function () { poll(triesLeft - 1); }, 1500); return; }
              // A real "declined" state and "we just haven't found the row
              // yet" (a brief lookup hiccup, cold start, whatever) look
              // identical from here, but they are NOT the same claim to
              // make to someone who may have genuinely paid - a red X and
              // a dead end is exactly wrong if the charge went through and
              // this is only a lookup delay. Softer copy, plus a manual
              // retry that costs nothing to offer, instead of asserting
              // failure on a payment that might be completely fine.
              mark('fail');
              if (titleEl) titleEl.textContent = "Still confirming…";
              if (subEl) subEl.textContent = "We haven't been able to find this order yet. If you completed payment, it may just be taking a moment to show up here - try checking again, or check your dashboard.";
              if (tyRetryBtn) tyRetryBtn.hidden = false;
              return;
            }
            if (data.status === 'paid') {
              mark('ok');
              if (tyRetryBtn) tyRetryBtn.hidden = true;
              if (titleEl) titleEl.textContent = 'Payment confirmed!';
              if (subEl) subEl.textContent = 'Your files are ready below.';
              renderItems(data.items || []);
              maybeShowResellerPopup(data.items || []);
            } else if (triesLeft > 0) {
              // Crypto sits in "pending" for real minutes while the network
              // confirms, so say that rather than leaving a blank wait.
              if (cryptoOrderIdParam && subEl) {
                subEl.textContent = 'Waiting for the network to confirm your payment. This usually takes a few minutes; you can close this page and your order will still complete.';
              }
              setTimeout(function () { poll(triesLeft - 1); }, 1500);
            } else if (subEl) {
              subEl.textContent = cryptoOrderIdParam
                ? 'Still confirming on the network. Your order will complete automatically once it lands; check your dashboard shortly.'
                : 'Still finalizing your payment; check the Download Centre in your dashboard shortly.';
            }
          })
          .catch(function () {
            if (triesLeft > 0) setTimeout(function () { poll(triesLeft - 1); }, 1500);
          });
      }

      var resellerOverlay = document.getElementById('resellerOverlay');
      var resellerForm = document.getElementById('resellerForm');
      function resellerShownKey() { return 'coldd_reseller_popup_' + (sessionId || robuxOrderIdParam); }
      function maybeShowResellerPopup(items) {
        if (!resellerOverlay || !resellerForm) return;
        var hasResell = items.some(function (it) { return it.licence === 'resell'; });
        if (!hasResell) return;
        try { if (localStorage.getItem(resellerShownKey())) return; } catch (e) {}
        resellerOverlay.hidden = false;
      }
      function dismissResellerPopup() {
        resellerOverlay.hidden = true;
        try { localStorage.setItem(resellerShownKey(), '1'); } catch (e) {}
      }
      if (resellerOverlay) {
        var resellerCloseBtn = document.getElementById('resellerClose');
        if (resellerCloseBtn) resellerCloseBtn.addEventListener('click', dismissResellerPopup);
        if (resellerForm) resellerForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var submitBtn = document.getElementById('resellerSubmit');
          var msgEl = document.getElementById('resellerMsg');
          var payload = {
            email: document.getElementById('resellerEmail').value.trim(),
            sellingWhere: document.getElementById('resellerWhere').value.trim(),
            sellingNotes: document.getElementById('resellerNotes').value.trim() || null
          };
          if (sessionId) payload.sessionId = sessionId; else payload.orderId = robuxOrderIdParam;
          submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
          window.coldSupabase.functions.invoke('submit-reseller-info', { body: payload })
            .then(function (res) {
              var data = res && res.data;
              if (!data || !data.ok) {
                submitBtn.disabled = false; submitBtn.textContent = 'Submit';
                if (msgEl) msgEl.textContent = (data && data.error) || 'Could not save, please try again.';
                return;
              }
              dismissResellerPopup();
            })
            .catch(function () {
              submitBtn.disabled = false; submitBtn.textContent = 'Submit';
              if (msgEl) msgEl.textContent = 'Could not save, please try again.';
            });
        });
      }

      // Capture first, then poll. If the capture call itself fails we still
      // poll: the order may already have been captured by an earlier attempt,
      // and the poll is what tells the buyer the truth either way. The function
      // is idempotent, so a retry here is always safe.
      // 10 tries (15s) used to be the whole budget, including for the
      // "order not found at all" case - a lookup hiccup or a moment of
      // replication/propagation lag on a real, successful payment had no
      // more patience than a genuinely nonexistent order, and no recovery
      // once that ran out. 30 tries (~45s) up front, plus the manual retry
      // wired below, instead of asserting failure on a fresh time budget.
      var INITIAL_POLL_TRIES = 30;
      if (tyRetryBtn) tyRetryBtn.addEventListener('click', function () {
        tyRetryBtn.hidden = true;
        tyRetryBtn.disabled = true;
        if (titleEl) titleEl.textContent = 'Confirming your payment…';
        if (subEl) subEl.textContent = 'Hang tight, this only takes a moment.';
        if (markEl) markEl.setAttribute('data-state', 'pending');
        if (tyRoot) tyRoot.setAttribute('data-state', 'pending');
        poll(INITIAL_POLL_TRIES);
        tyRetryBtn.disabled = false;
      });

      if (paypalOrderIdParam && window.coldSupabase) {
        if (titleEl) titleEl.textContent = 'Completing your payment…';
        if (subEl) subEl.textContent = 'Confirming with PayPal. Please do not close this page.';
        window.coldSupabase.functions
          .invoke('capture-paypal-order', { body: { orderId: paypalOrderIdParam } })
          .then(function (res) {
            var data = res && res.data;
            if (data && data.ok === false && subEl) {
              // A hard failure here means money did not move. Say so plainly
              // rather than letting the poll time out into a vague message.
              mark('fail');
              subEl.textContent = data.error || 'PayPal could not complete this payment.';
            }
          })
          .catch(function () {})
          .then(function () { poll(INITIAL_POLL_TRIES); });
      } else {
        poll(INITIAL_POLL_TRIES);
      }
    })();
