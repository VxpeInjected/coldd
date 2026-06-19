    const nav = document.getElementById('nav');
    const backdrop = document.querySelector('.backdrop');
    const bar = document.querySelector('.cscroll');
    const thumb = document.querySelector('.cscroll-thumb');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cached page metrics (recomputed only on resize/load), updates batched in rAF
    let winH = window.innerHeight, docH = document.documentElement.scrollHeight;
    function measure() {
      winH = window.innerHeight;
      docH = document.documentElement.scrollHeight;
      if (bar) bar.style.display = (docH <= winH + 4) ? 'none' : 'block';
      render();
    }
    let ticking = false;
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(render); } }
    function render() {
      ticking = false;
      const y = window.scrollY;
      nav.classList.toggle('scrolled', y > 12);
      if (backdrop && !reduceMotion) {
        const py = Math.min(y * 0.3, winH * 0.18);
        backdrop.style.transform = 'translate3d(0,' + (-py) + 'px,0)';
      }
      if (bar && thumb && docH > winH) {
        const trackH = winH - 36;
        const th = Math.max(trackH * (winH / docH), 44);
        thumb.style.height = th + 'px';
        thumb.style.top = (18 + (y / (docH - winH)) * (trackH - th)) + 'px';
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    measure();

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll('.reveal');
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
    } else {
      const io = new IntersectionObserver((en) => en.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      els.forEach(e => io.observe(e));
    }

    // Team panels: smooth slide between members (active class persists across the gap)
    const tpanels = document.querySelectorAll('.tpanel');
    const teamGrid = document.querySelector('.team');
    tpanels.forEach(pn => pn.addEventListener('mouseenter', () => {
      tpanels.forEach(x => x.classList.remove('active'));
      pn.classList.add('active');
    }));
    if (teamGrid) teamGrid.addEventListener('mouseleave', () => {
      tpanels.forEach(x => x.classList.remove('active'));
    });

    // Nav search expand / collapse + live results
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
        navSet.style.maxWidth = navSet.scrollWidth + 'px'; // pin to real width
        navSet.getBoundingClientRect();                    // force reflow
        links.classList.add('searching');
        navSet.style.maxWidth = '0px';                     // collapse from real width (no overshoot)
        setTimeout(function () { input.focus(); }, 60);
      }
      function close() {
        if (!isOpen()) return;
        links.classList.remove('searching');
        navSet.style.maxWidth = navSet.scrollWidth + 'px'; // expand back to real width
        setTimeout(function () { navSet.style.maxWidth = 'none'; }, 600);
        input.value = ''; input.blur();
        hidePanel();
      }

      // ---- live search ----
      function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
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
        { label: 'Home', href: 'index.html' },
        { label: 'Roblox', href: 'assets.html' },
        { label: 'Minecraft', href: 'minecraft.html' },
        { label: 'About Us', href: 'about.html' }
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
        // Pages, categories (genres), and assets are separate result types.
        const pages = PAGES.filter(function (pg) { return pg.label.toLowerCase().indexOf(q) >= 0; });
        const cats = (window.__CATEGORIES || []).filter(function (c) {
          return c.label.toLowerCase().indexOf(q) >= 0;
        }).slice(0, 5);
        const assets = (window.__CATALOG || []).filter(function (p) {
          return p.title.toLowerCase().indexOf(q) >= 0;   // match the asset NAME only
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
              '<span class="sresult-price">' + esc(p.price) + '</span>';
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () {
              if (window.__openProduct) window.__openProduct(p);
              close();
            });
            list.appendChild(b);
          });
        }
        showPanel();
      }

      // keep input focused when clicking the icon so the toggle wins over blur
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
    })();

    // Scrollbar drag to scroll (rAF-batched so it stays smooth)
    if (thumb) {
      let dragging = false, startY = 0, startScroll = 0, pendingY = 0, dragRaf = 0;
      function dragStep() {
        dragRaf = 0;
        const trackH = winH - 36;
        const th = Math.max(trackH * (winH / docH), 44);
        const dScroll = ((pendingY - startY) / (trackH - th)) * (docH - winH);
        let target = startScroll + dScroll;
        target = Math.max(0, Math.min(target, docH - winH));
        window.scrollTo(0, target);
      }
      thumb.addEventListener('mousedown', e => {
        dragging = true; startY = e.clientY; startScroll = window.scrollY;
        thumb.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; e.preventDefault();
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        pendingY = e.clientY;
        if (!dragRaf) dragRaf = requestAnimationFrame(dragStep);
      }, { passive: true });
      window.addEventListener('mouseup', () => {
        dragging = false; thumb.style.cursor = 'grab'; document.body.style.userSelect = '';
      });
    }

    // Nav mega dropdown (Assets)
    (function () {
      const trigger = document.getElementById('assetsLink');
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
      function open() {
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
    })();

    // Products filtering — works per .shop, so multiple shops (Roblox + Minecraft)
    // can coexist in the single-file preview. ?cat= deep-link uses each shop's base page.
    (function () {
      const shops = document.querySelectorAll('.shop');
      if (!shops.length) return;
      shops.forEach(function (shop) {
        const filters = shop.querySelector('.filters');
        const grid = shop.querySelector('.product-grid');
        if (!filters || !grid) return;
        const empty = shop.querySelector('.shop-empty');
        const products = Array.prototype.slice.call(grid.querySelectorAll('.product'));
        const base = shop.getAttribute('data-page') || (location.pathname.split('/').pop() || 'assets.html');
        function apply(cat) {
          let shown = 0;
          products.forEach(function (p) {
            const ok = cat === 'all' || p.getAttribute('data-cat') === cat;
            p.style.display = ok ? '' : 'none';
            if (ok) shown++;
          });
          filters.querySelectorAll('.chip').forEach(function (c) {
            c.classList.toggle('active', c.getAttribute('data-cat') === cat);
          });
          if (empty) empty.hidden = shown > 0;
        }
        shop.__applyCat = apply; // used by the single-file preview router
        filters.addEventListener('click', function (e) {
          const c = e.target.closest('.chip'); if (!c) return;
          const cat = c.getAttribute('data-cat');
          apply(cat);
          try { history.replaceState(null, '', cat === 'all' ? base : (base + '?cat=' + cat)); } catch (_) {}
        });
        const initial = new URLSearchParams(location.search).get('cat');
        apply(initial && filters.querySelector('.chip[data-cat="' + initial + '"]') ? initial : 'all');
      });
    })();

    // Smooth page-leave fade for real multi-page navigation (disabled in single-file preview)
    if (!window.__singleFile) {
      const mainEl = document.querySelector('main');
      document.addEventListener('click', function (e) {
        const a = e.target.closest('a'); if (!a || a.target === '_blank') return;
        const href = a.getAttribute('href') || '';
        if (!/^(index\.html|assets\.html|minecraft\.html|about\.html)(\?|#|$)/.test(href)) return;
        // same page + only a hash → let the browser scroll, no fade
        const here = location.pathname.split('/').pop() || 'index.html';
        const target = href.split(/[?#]/)[0] || 'index.html';
        if (href.charAt(0) === '#' || (target === here && href.indexOf('#') !== -1 && href.indexOf('?') === -1)) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        e.preventDefault();
        if (mainEl) mainEl.classList.add('page-leaving');
        setTimeout(function () { location.href = href; }, 165);
      });
      // restore from bfcache without a stuck faded-out state
      window.addEventListener('pageshow', function (ev) {
        if (ev.persisted && mainEl) mainEl.classList.remove('page-leaving');
      });
    }

    // Interactive bento cards: press + click ripple
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

    // ===== Cart + product buy modal =====
    (function () {
      var KEY = 'coldd_cart_v1';
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (_) { cart = []; }

      var countEl = document.getElementById('cartCount');
      var headCount = document.getElementById('cartHeadCount');
      var fab = document.getElementById('cartFab');
      var fabTotal = document.getElementById('cartFabTotal');
      var drawer = document.getElementById('cartDrawer');
      var overlay = document.getElementById('cartOverlay');
      var itemsEl = document.getElementById('cartItems');
      var emptyEl = document.getElementById('cartEmpty');
      var subEl = document.getElementById('cartSubtotal');

      function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) {} }
      function money(n) { return '$' + (Math.round(n * 100) / 100).toLocaleString(); }
      function count() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
      function subtotal() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

      // ---- Payment method choice (USD / Robux) ----
      var ROBUX_PER_USD = 80; // ~Roblox marketplace rate; adjust to taste
      var payOverlay = document.getElementById('payOverlay');
      var payUsdAmt = document.getElementById('payUsdAmt');
      var payRobuxAmt = document.getElementById('payRobuxAmt');
      var paySub = document.getElementById('paySub');
      var payPending = null;
      function robux(usd) { return 'R$ ' + Math.round(usd * ROBUX_PER_USD).toLocaleString(); }
      function openPay(usd, label, onChoose) {
        if (payUsdAmt) payUsdAmt.textContent = money(usd);
        if (payRobuxAmt) payRobuxAmt.textContent = robux(usd);
        if (paySub && label) paySub.textContent = label;
        payPending = onChoose;
        if (payOverlay) payOverlay.hidden = false;
        document.body.classList.add('no-scroll');
      }
      function closePay() { if (payOverlay) payOverlay.hidden = true; payPending = null; document.body.classList.remove('no-scroll'); }
      function choosePay(currency) { var cb = payPending; closePay(); if (cb) cb(currency); }
      var payUsdBtn = document.getElementById('payUsd');
      var payRobuxBtn = document.getElementById('payRobux');
      var payCloseBtn = document.getElementById('payClose');
      if (payUsdBtn) payUsdBtn.addEventListener('click', function () { choosePay('usd'); });
      if (payRobuxBtn) payRobuxBtn.addEventListener('click', function () { choosePay('robux'); });
      if (payCloseBtn) payCloseBtn.addEventListener('click', closePay);
      if (payOverlay) payOverlay.addEventListener('click', function (e) { if (e.target === payOverlay) closePay(); });

      function updateBadge() {
        var c = count();
        if (countEl) countEl.textContent = c;
        if (headCount) headCount.textContent = c + (c === 1 ? ' item' : ' items');
        if (fabTotal) fabTotal.textContent = money(subtotal());
        if (fab) fab.classList.toggle('show', c > 0); // floating cart only when items exist
      }
      function clearCart() { cart = []; save(); updateBadge(); renderCart(); }
      function add(item) {
        var found = cart.filter(function (i) { return i.id === item.id; })[0];
        if (found) found.qty += 1;
        else cart.push({ id: item.id, title: item.title, price: item.price, image: item.image, tag: item.tag || '', qty: 1 });
        save(); updateBadge(); renderCart();
      }
      function setQty(id, q) {
        cart = cart.map(function (i) { return i.id === id ? Object.assign(i, { qty: q }) : i; })
                   .filter(function (i) { return i.qty > 0; });
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
            '<div class="ci-info"><div class="ci-title">' + esc(i.title) + '</div>' +
            '<div class="ci-price">' + money(i.price) + '</div></div>' +
            '<div class="ci-qty"><button type="button" data-act="dec" aria-label="Decrease">−</button>' +
            '<span>' + i.qty + '</span><button type="button" data-act="inc" aria-label="Increase">+</button></div>' +
            '<button class="ci-remove" type="button" data-act="rm" aria-label="Remove">×</button>';
          row.querySelector('[data-act="dec"]').addEventListener('click', function () { setQty(i.id, i.qty - 1); });
          row.querySelector('[data-act="inc"]').addEventListener('click', function () { setQty(i.id, i.qty + 1); });
          row.querySelector('[data-act="rm"]').addEventListener('click', function () { setQty(i.id, 0); });
          // click the thumbnail / details to jump back to that product
          var reopen = function () { closeCart(); openModal({ id: i.id, title: i.title, price: i.price, image: i.image, tag: i.tag || '' }); };
          row.querySelector('.ci-thumb').addEventListener('click', reopen);
          row.querySelector('.ci-info').addEventListener('click', reopen);
          itemsEl.appendChild(row);
        });
        if (subEl) subEl.textContent = money(subtotal());
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
        openPay(subtotal(), 'How would you like to check out?', function () {
          window.open('https://discord.gg/coldd', '_blank', 'noopener');
          clearCart(); closeCart(); // order handed off → cart empties, floating cart hides
        });
      });

      // ---- product buy modal ----
      var pmOverlay = document.getElementById('pmOverlay');
      var pmMedia = document.getElementById('pmMedia');
      var pmTitle = document.getElementById('pmTitle');
      var pmPrice = document.getElementById('pmPrice');
      var pmDesc = document.getElementById('pmDesc');
      var pmTag = document.getElementById('pmTag');
      var pmAdd = document.getElementById('pmAdd');
      var pmBuy = document.getElementById('pmBuy');
      var active = null;

      function readCard(card) {
        var titleEl = card.querySelector('.p-body h3');
        var priceEl = card.querySelector('.p-price');
        var thumb = card.querySelector('.p-thumb');
        var tagEl = card.querySelector('.p-tag');
        var bg = thumb ? (thumb.style.backgroundImage || getComputedStyle(thumb).backgroundImage) : '';
        var m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
        var title = titleEl ? titleEl.textContent.trim() : 'Product';
        var price = priceEl ? (parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0) : 0;
        return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: title, price: price,
                 image: m ? m[1] : '', tag: tagEl ? tagEl.textContent.trim() : '' };
      }
      function openModal(data) {
        active = data;
        if (pmMedia) pmMedia.style.setProperty('--img', data.image ? "url('" + data.image + "')" : 'none');
        if (pmTitle) pmTitle.textContent = data.title;
        if (pmPrice) pmPrice.textContent = money(data.price);
        if (pmTag) { pmTag.textContent = data.tag; pmTag.hidden = !data.tag; }
        if (pmDesc) pmDesc.textContent = 'A ready-to-use coldd asset — instant delivery with full files and setup support from our team.';
        if (pmOverlay) pmOverlay.hidden = false;
        document.body.classList.add('no-scroll');
      }
      function closeModal() { if (pmOverlay) pmOverlay.hidden = true;
        document.body.classList.remove('no-scroll'); active = null; }

      // expose so the live search can open any product's buy modal from any page
      window.__openProduct = function (data) {
        openModal({
          id: (data.id || data.title).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: data.title,
          price: typeof data.price === 'number' ? data.price : (parseFloat(String(data.price).replace(/[^0-9.]/g, '')) || 0),
          image: data.image || '',
          tag: data.tag || data.cat || ''
        });
      };

      document.addEventListener('click', function (e) {
        if (e.target.closest('.cart-drawer') || e.target.closest('.pm-modal') || e.target.closest('.search-panel')) return;
        var card = e.target.closest('.product');
        if (card) { e.preventDefault(); openModal(readCard(card)); }
      });
      var pmCloseBtn = document.getElementById('pmClose');
      if (pmCloseBtn) pmCloseBtn.addEventListener('click', closeModal);
      if (pmOverlay) pmOverlay.addEventListener('click', function (e) { if (e.target === pmOverlay) closeModal(); });
      if (pmAdd) pmAdd.addEventListener('click', function () { if (active) { add(active); closeModal(); openCart(); } });
      if (pmBuy) pmBuy.addEventListener('click', function () {
        if (!active) return;
        var item = active;
        openPay(item.price, 'How would you like to buy “' + item.title + '”?', function () {
          add(item); closeModal();
          window.open('https://discord.gg/coldd', '_blank', 'noopener');
          clearCart(); // order handed off → cart empties
        });
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closePay(); closeModal(); closeCart(); }
      });

      updateBadge();
    })();
