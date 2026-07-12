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
      window.__money = function (usd) { return mode === 'robux' ? window.__robux(usd) : fmtFiat(usd, byCode[fiatCode] || byCode.USD); };

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

    (function () {
      const bar = document.getElementById('announce');
      if (!bar) return;
      function hide() { document.documentElement.setAttribute('data-ann', 'off'); window.dispatchEvent(new Event('resize')); }
      const x = document.getElementById('announceX');
      if (x) x.addEventListener('click', hide);
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
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
    } else {
      const io = new IntersectionObserver((en) => en.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      els.forEach(e => io.observe(e));
    }

    (function () {
      const track = document.getElementById('nrTrack');
      if (!track) return;
      const slides = track.children.length;
      if (slides <= 1) return;
      const dots = Array.prototype.slice.call(document.querySelectorAll('#nrDots .nr-dot'));
      const DELAY = 3500;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let i = 0, timer = null;
      function go(n) {
        i = (n % slides + slides) % slides;
        track.style.transform = 'translateX(' + (-i * 100) + '%)';
        dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
      }
      function start() { if (!reduced && !timer) timer = setInterval(function () { go(i + 1); }, DELAY); }
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
              if (window.__openProduct) window.__openProduct(p);
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
        const base = shop.getAttribute('data-page') || (location.pathname.split('/').pop() || 'assets.html');
        const products = Array.prototype.slice.call(grid.querySelectorAll('.product'));
        const PER_PAGE = 12;
        let page = 1;

        let maxPrice = 0;
        products.forEach(function (p) { maxPrice = Math.max(maxPrice, parseFloat(p.getAttribute('data-price')) || 0); });
        maxPrice = Math.max(10, Math.ceil(maxPrice / 10) * 10);
        if (prMin && prMax) { prMin.max = prMax.max = maxPrice; prMin.value = 0; prMax.value = maxPrice; }
        let curCat = 'all', curSub = null, query = '', lo = 0, hi = maxPrice;

        function money(n) { return window.__money ? window.__money(n) : ('$' + n); }
        function paintRange() {
          if (prFill) { prFill.style.left = (lo / maxPrice * 100) + '%'; prFill.style.width = ((hi - lo) / maxPrice * 100) + '%'; }
          if (prMinVal) prMinVal.textContent = money(lo);
          if (prMaxVal) prMaxVal.textContent = money(hi);
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
          const okSub = !curSub || p.getAttribute('data-subcat') === curSub;
          return okCat && okSub && (!query || title.indexOf(query) >= 0) && price >= lo && price <= hi;
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
        function refilter(resetPage) {
          if (resetPage) page = 1;
          const matched = products.filter(matches);
          const pages = Math.max(1, Math.ceil(matched.length / PER_PAGE));
          if (page > pages) page = pages;
          const start = (page - 1) * PER_PAGE;
          products.forEach(function (p) { p.style.display = 'none'; });
          matched.slice(start, start + PER_PAGE).forEach(function (p) { p.style.display = ''; });
          if (empty) empty.hidden = matched.length > 0;
          renderPager(pages);
        }
        function setCat(cat) { curCat = cat; curSub = null; syncCats(); refilter(true); }
        function setSub(cat, sub) { curCat = cat; curSub = sub; syncCats(); refilter(true); }
        shop.__applyCat = setCat;

        if (chips) chips.addEventListener('click', function (e) {
          const c = e.target.closest('.chip'); if (!c) return;
          setCat(c.getAttribute('data-cat'));
          try { history.replaceState(null, '', curCat === 'all' ? base : (base + '?cat=' + curCat)); } catch (_) {}
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
        window.addEventListener('currencychange', paintRange);

        paintRange();
        const initial = new URLSearchParams(location.search).get('cat');
        const hasInit = initial && ((chips && chips.querySelector('.chip[data-cat="' + initial + '"]')) || (sideCats && sideCats.querySelector('.fc-cat[data-cat="' + initial + '"]')));
        setCat(hasInit ? initial : 'all');
      });
    })();

    if (!window.__singleFile) {
      const mainEl = document.querySelector('main');
      document.addEventListener('click', function (e) {
        const a = e.target.closest('a'); if (!a || a.target === '_blank') return;
        const href = a.getAttribute('href') || '';
        if (!/^(index\.html|assets\.html|minecraft\.html|about\.html)(\?|#|$)/.test(href)) return;

        const here = location.pathname.split('/').pop() || 'index.html';
        const target = href.split(/[?#]/)[0] || 'index.html';
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
      function money(n) { return window.__money ? window.__money(n) : ('$' + n); }
      function count() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
      function subtotal() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

      var ROBUX_PER_USD = 80;
      var payOverlay = document.getElementById('payOverlay');
      var payUsdAmt = document.getElementById('payUsdAmt');
      var payRobuxAmt = document.getElementById('payRobuxAmt');
      var paySub = document.getElementById('paySub');
      var payPending = null;
      function openPay(usd, label, onChoose) {

        if (payUsdAmt) payUsdAmt.textContent = window.__usd ? window.__usd(usd) : ('$' + usd);
        if (payRobuxAmt) payRobuxAmt.textContent = window.__robux ? window.__robux(usd) : ('R$ ' + Math.round(usd * ROBUX_PER_USD));
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
        if (countEl) countEl.textContent = c > 99 ? '99+' : c;
        if (headCount) headCount.textContent = c + (c === 1 ? ' item' : ' items');
        if (fabTotal) fabTotal.textContent = money(subtotal());
        if (fab) fab.classList.toggle('has-items', c > 0);
      }
      function clearCart() { cart = []; save(); updateBadge(); renderCart(); }
      function add(item) {
        var lic = item.licence || 'standard';
        var id = item.id + (lic === 'resell' ? '--resell' : '');
        var found = cart.filter(function (i) { return i.id === id; })[0];
        if (found) found.qty += 1;
        else cart.push({ id: id, title: item.title, price: item.price, image: item.image, tag: item.tag || '', licence: lic, qty: 1 });
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
            '<div class="ci-info"><div class="ci-title">' + esc(i.title) + (i.licence === 'resell' ? ' <span style="color:var(--accent);font-size:11px;font-weight:700;">· RESELL</span>' : '') + '</div>' +
            '<div class="ci-price">' + money(i.price) + '</div></div>' +
            '<div class="ci-qty"><button type="button" data-act="dec" aria-label="Decrease">−</button>' +
            '<span>' + i.qty + '</span><button type="button" data-act="inc" aria-label="Increase">+</button></div>' +
            '<button class="ci-remove" type="button" data-act="rm" aria-label="Remove">×</button>';
          row.querySelector('[data-act="dec"]').addEventListener('click', function () { setQty(i.id, i.qty - 1); });
          row.querySelector('[data-act="inc"]').addEventListener('click', function () { setQty(i.id, i.qty + 1); });
          row.querySelector('[data-act="rm"]').addEventListener('click', function () { setQty(i.id, 0); });

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
        closeCart();
        if (window.__goCheckout) window.__goCheckout(); else location.href = 'checkout.html';
      });

      var pmOverlay = document.getElementById('pmOverlay');
      var pmMedia = document.getElementById('pmMedia');
      var pmTitle = document.getElementById('pmTitle');
      var pmPrice = document.getElementById('pmPrice');
      var pmDesc = document.getElementById('pmDesc');
      var pmTag = document.getElementById('pmTag');
      var pmAdd = document.getElementById('pmAdd');
      var pmBuy = document.getElementById('pmBuy');
      var active = null;

      var pmImg = null, pmThumbs = document.getElementById('pmThumbs');
      if (pmMedia) {
        pmImg = document.createElement('img');
        pmImg.className = 'pm-img'; pmImg.alt = ''; pmImg.decoding = 'async';
        pmMedia.appendChild(pmImg);
      }

      function buildGallery(main) {
        var imgs = main ? [main] : [];
        var cat = window.__CATALOG || [];
        for (var i = 0; i < cat.length && imgs.length < 5; i++) {
          var im = cat[i].image;
          if (im && imgs.indexOf(im) < 0) imgs.push(im);
        }
        return imgs;
      }
      function setMainImage(src) {
        if (pmImg) pmImg.src = src || '';
        if (pmThumbs) pmThumbs.querySelectorAll('.pm-thumb').forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-src') === src);
        });
      }
      function renderThumbs(imgs) {
        if (!pmThumbs) return;
        pmThumbs.innerHTML = '';
        pmThumbs.hidden = imgs.length < 2;
        if (imgs.length < 2) return;
        imgs.forEach(function (src) {
          var t = document.createElement('button'); t.type = 'button'; t.className = 'pm-thumb';
          t.setAttribute('data-src', src); t.setAttribute('aria-label', 'View image');
          t.style.backgroundImage = "url('" + src + "')";
          t.addEventListener('click', function () { setMainImage(src); });
          pmThumbs.appendChild(t);
        });
      }

      function readCard(card) {
        var titleEl = card.querySelector('.p-name') || card.querySelector('.p-body h3');
        var priceEl = card.querySelector('.p-price');
        var thumb = card.querySelector('.p-thumb');
        var descEl = card.querySelector('.p-sum') || card.querySelector('.p-desc');
        var tag = card.getAttribute('data-catlabel') || (card.querySelector('.p-cat') ? card.querySelector('.p-cat').textContent.trim() : '');
        var bg = thumb ? (thumb.style.backgroundImage || getComputedStyle(thumb).backgroundImage) : '';
        var m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
        var title = titleEl ? titleEl.textContent.trim() : 'Product';
        var price = 0;
        if (priceEl) {
          var du = priceEl.getAttribute('data-usd');
          price = du != null ? (parseFloat(du) || 0) : (parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0);
        }
        return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: title, price: price,
                 image: m ? m[1] : '', tag: tag,
                 desc: descEl ? descEl.textContent.trim() : '',
                 resell: card.getAttribute('data-resell') === 'yes' };
      }
      var RESELL_MULT = 3;
      var pmLicence = document.getElementById('pmLicence');
      var pmLicLabel = document.querySelector('.pm-lic-label');
      var licBtns = document.querySelectorAll('#pmLicence .pm-lic');
      var licPriceEls = document.querySelectorAll('#pmLicence [data-licprice]');
      function refreshLicPrices() {
        if (!active) return;
        licPriceEls.forEach(function (el) {
          var p = el.getAttribute('data-licprice') === 'resell' ? Math.round(active.basePrice * RESELL_MULT) : active.basePrice;
          el.textContent = money(p);
        });
      }
      function setLicence(lic) {
        if (!active) return;
        active.licence = lic;
        active.price = lic === 'resell' ? Math.round(active.basePrice * RESELL_MULT) : active.basePrice;
        if (pmPrice) pmPrice.textContent = money(active.price);
        licBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lic') === lic); });
      }
      licBtns.forEach(function (b) { b.addEventListener('click', function () { setLicence(b.getAttribute('data-lic')); }); });
      window.addEventListener('currencychange', function () {
        if (active && pmOverlay && !pmOverlay.hidden) {
          if (pmPrice) pmPrice.textContent = money(active.price);
          refreshLicPrices();
        }
      });

      function openModal(data) {
        data.basePrice = data.price; data.licence = 'standard';
        active = data;
        var gallery = buildGallery(data.image);
        renderThumbs(gallery);
        setMainImage(gallery[0] || '');
        if (pmTitle) pmTitle.textContent = data.title;
        if (pmPrice) pmPrice.textContent = money(data.price);
        refreshLicPrices();
        if (pmLicence) pmLicence.style.display = data.resell ? '' : 'none';
        if (pmLicLabel) pmLicLabel.style.display = data.resell ? '' : 'none';
        licBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lic') === 'standard'); });
        if (pmTag) { pmTag.textContent = data.tag; pmTag.hidden = !data.tag; }
        if (pmDesc) pmDesc.textContent = data.desc || 'A ready-to-use coldd asset, instant delivery with full files and setup support from our team.';
        if (pmOverlay) pmOverlay.hidden = false;
        document.body.classList.add('no-scroll');
      }
      function closeModal() { if (pmOverlay) pmOverlay.hidden = true;
        document.body.classList.remove('no-scroll'); active = null; }

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
        if (!card) return;
        e.preventDefault();
        if (e.target.closest('.p-add')) { add(readCard(card)); openCart(); }
        else openModal(readCard(card));
      });
      var pmCloseBtn = document.getElementById('pmClose');
      if (pmCloseBtn) pmCloseBtn.addEventListener('click', closeModal);
      if (pmOverlay) pmOverlay.addEventListener('click', function (e) { if (e.target === pmOverlay) closeModal(); });
      if (pmAdd) pmAdd.addEventListener('click', function () { if (active) { add(active); closeModal(); openCart(); } });
      if (pmBuy) pmBuy.addEventListener('click', function () {
        if (!active) return;
        add(active); closeModal();
        if (window.__goCheckout) window.__goCheckout(); else location.href = 'checkout.html';
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closePay(); closeModal(); closeCart(); }
      });

      window.addEventListener('currencychange', function () {
        updateBadge(); renderCart();
        if (pmOverlay && pmOverlay.hidden === false && active && pmPrice) pmPrice.textContent = money(active.price);
      });

      updateBadge();
    })();

    (function () {
      var overlay = document.getElementById('authOverlay');
      var btn = document.getElementById('accountBtn');
      if (!overlay) return;
      var VIEWS = ['signin', 'signup', 'forgot'];
      function showView(v) {
        VIEWS.forEach(function (k) { var el = document.getElementById('av-' + k); if (el) el.hidden = (k !== v); });
      }
      function open(v) { showView(v || 'signin'); overlay.hidden = false; document.body.classList.add('no-scroll'); }
      function close() { overlay.hidden = true; document.body.classList.remove('no-scroll'); }
      window.__authClose = close;

      if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.__isLoggedIn && window.__isLoggedIn()) { if (window.__goDashboard) window.__goDashboard(); }
        else open('signin');
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { close(); return; }
        if (e.target.closest('.auth-x')) { close(); return; }
        var sw = e.target.closest('[data-auth-view]');
        if (sw) { e.preventDefault(); showView(sw.getAttribute('data-auth-view')); }
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) close(); });

      function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
      function val(f, n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
      function fieldErr(f, n, m) {
        var fl = f.querySelector('.auth-field[data-for="' + n + '"]'); if (!fl) return;
        fl.classList.toggle('invalid', !!m); var e = fl.querySelector('.auth-err'); if (e) e.textContent = m || '';
      }
      function flash(f, t) { var c = f.closest('.auth-card'); if (!c) return; var m = c.querySelector('.auth-msg'); if (m) { m.textContent = t; m.classList.add('show'); } }

      overlay.querySelectorAll('.auth-pw-toggle').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = b.parentNode.querySelector('input'); if (!i) return;
          var s = i.type === 'password'; i.type = s ? 'text' : 'password';
          b.setAttribute('aria-label', s ? 'Hide password' : 'Show password');
        });
      });

      overlay.querySelectorAll('.auth-oauth').forEach(function (b) {
        b.addEventListener('click', function () { close(); if (window.__demoLogin) window.__demoLogin(); });
      });
      var si = document.getElementById('form-signin');
      if (si) si.addEventListener('submit', function (e) {
        e.preventDefault(); var ok = true, em = val(si, 'email'), pw = val(si, 'password');
        if (!emailOk(em)) { fieldErr(si, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(si, 'email', '');
        if (!pw) { fieldErr(si, 'password', 'Enter your password.'); ok = false; } else fieldErr(si, 'password', '');
        if (ok) { close(); if (window.__demoLogin) window.__demoLogin(); }
      });
      var su = document.getElementById('form-signup');
      if (su) su.addEventListener('submit', function (e) {
        e.preventDefault(); var ok = true, em = val(su, 'email'), pw = val(su, 'password'), cf = val(su, 'confirm');
        var tos = su.querySelector('[name="tos"]');
        if (!emailOk(em)) { fieldErr(su, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(su, 'email', '');
        if (pw.length < 8) { fieldErr(su, 'password', 'Use at least 8 characters.'); ok = false; } else fieldErr(su, 'password', '');
        if (!cf || cf !== pw) { fieldErr(su, 'confirm', "Passwords don't match."); ok = false; } else fieldErr(su, 'confirm', '');
        var te = su.querySelector('.auth-err[data-for="tos"]');
        if (tos && !tos.checked) { if (te) te.textContent = 'Please accept the Terms to continue.'; ok = false; } else if (te) te.textContent = '';
        if (ok) { close(); if (window.__demoLogin) window.__demoLogin(); }
      });
      var fo = document.getElementById('form-forgot');
      if (fo) fo.addEventListener('submit', function (e) {
        e.preventDefault(); var em = val(fo, 'email');
        if (!emailOk(em)) { fieldErr(fo, 'email', 'Enter a valid email.'); return; } fieldErr(fo, 'email', '');
        flash(fo, 'If an account exists for ' + em + ", we'll email a reset link shortly.");
      });
    })();

    (function () {
      var KEY = 'coldd_auth';

      window.__isLoggedIn = function () { try { return localStorage.getItem(KEY) !== 'out'; } catch (e) { return true; } };
      function setState(v) { try { localStorage.setItem(KEY, v ? 'in' : 'out'); } catch (e) {} }

      window.__goDashboard = function () {
        if (window.__go) window.__go('dashboard');
        else location.href = 'dashboard.html';
      };
      window.__demoLogin = function () { setState(true); window.__goDashboard(); };

      var dash = document.querySelector('.dash');
      if (!dash) return;
      var panels = dash.querySelectorAll('.dash-panel');
      var navlinks = dash.querySelectorAll('.dash-nav a, [data-panel]');
      function showPanel(name) {
        panels.forEach(function (p) { p.hidden = (p.id !== 'panel-' + name); });
        dash.querySelectorAll('.dash-nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-panel') === name); });

      }
      dash.addEventListener('click', function (e) {
        var a = e.target.closest('[data-panel]');
        if (a) { e.preventDefault(); showPanel(a.getAttribute('data-panel')); }
      });

      var refCopy = document.getElementById('refCopy');
      if (refCopy) refCopy.addEventListener('click', function () {
        var inp = document.getElementById('refLink'); if (!inp) return;
        inp.select();
        try { navigator.clipboard.writeText(inp.value); } catch (e) { try { document.execCommand('copy'); } catch (_) {} }
        var t = refCopy.textContent; refCopy.textContent = 'Copied'; setTimeout(function () { refCopy.textContent = t; }, 1400);
      });

      dash.querySelectorAll('.wl-remove').forEach(function (x) {
        x.addEventListener('click', function () { var row = x.closest('.dash-row'); if (row) row.remove(); });
      });
      dash.querySelectorAll('.dr-cart').forEach(function (b) {
        b.addEventListener('click', function () { var t = b.textContent; b.textContent = 'Added ✓'; b.disabled = true; setTimeout(function () { b.textContent = t; b.disabled = false; }, 1400); });
      });

      var acct = document.getElementById('acctForm');
      if (acct) acct.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = acct.querySelector('.auth-msg');
        if (msg) { msg.textContent = 'Saved (demo), connect a backend to persist changes.'; msg.classList.add('show'); }
      });
      acct && acct.querySelectorAll('.auth-pw-toggle').forEach(function (b) {
        b.addEventListener('click', function () { var i = b.parentNode.querySelector('input'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; });
      });

      var del = document.getElementById('delAcct'), conf = document.getElementById('delConfirm');
      if (del && conf) {
        del.addEventListener('click', function () { conf.hidden = false; del.style.display = 'none'; });
        var cancel = document.getElementById('delCancel');
        if (cancel) cancel.addEventListener('click', function () { conf.hidden = true; del.style.display = ''; });
        var fin = document.getElementById('delFinal'), inp = document.getElementById('delInput');
        if (fin) fin.addEventListener('click', function () {
          if (inp && inp.value.trim().toUpperCase() === 'DELETE') {
            setState(false); window.__authClose && window.__authClose();
            if (window.__go) window.__go('home'); else location.href = 'index.html';
          } else if (inp) { inp.style.borderColor = 'var(--accent)'; inp.focus(); }
        });
      }

      var so = document.getElementById('dashSignout');
      if (so) so.addEventListener('click', function () {
        setState(false);
        if (window.__go) window.__go('home'); else location.href = 'index.html';
      });
    })();

    (function () {
      var root = document.querySelector('.checkout');
      window.__goCheckout = function () {

        if (root) { cart = load(); coupon = null; render(); buildSuggestions(); }
        if (window.__go) window.__go('checkout'); else location.href = 'checkout.html';
      };
      if (!root) return;

      var CART_KEY = 'coldd_cart_v1';
      var TAX_RATE = 0;
      var COUPONS = { SAVE10: { type: 'pct', val: 10, label: 'SAVE10 (−10%)' },
                      COLDD20: { type: 'pct', val: 20, label: 'COLDD20 (−20%)' },
                      WELCOME5: { type: 'flat', val: 5, label: 'WELCOME5 (−$5)' } };
      var money = function (n) { return window.__money ? window.__money(n) : ('$' + n); };
      var usd = function (n) { return window.__usd ? window.__usd(n) : ('$' + n); };
      function load() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []; } catch (e) { return []; } }
      function save(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) {} }
      var cart = load();
      var coupon = null;

      var itemsEl = document.getElementById('coItems'), emptyEl = document.getElementById('coEmpty');

      function subtotal() { return cart.reduce(function (s, i) { return s + (i.basePrice || i.price) * i.qty; }, 0); }

      function bundleSavings() { return cart.reduce(function (s, i) { return s + ((i.basePrice || i.price) - i.price) * i.qty; }, 0); }
      function couponAmount(net) {
        if (!coupon) return 0;
        return coupon.type === 'pct' ? net * coupon.val / 100 : Math.min(coupon.val, net);
      }
      function renderItems() {
        if (!itemsEl) return;
        itemsEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = cart.length > 0;
        cart.forEach(function (i) {
          var row = document.createElement('div'); row.className = 'co-item';
          var lic = i.licence === 'resell' ? ' · Resell licence' : '';
          row.innerHTML = '<span class="co-item-thumb" style="background-image:url(\'' + i.image + '\')"></span>' +
            '<div class="co-item-info"><div class="co-item-title">' + i.title + '</div><div class="co-item-sub">Qty ' + i.qty + lic + '</div></div>' +
            '<span class="co-item-price">' + money(i.price * i.qty) + '</span>';
          itemsEl.appendChild(row);
        });
      }
      function renderTotals() {
        var sub = subtotal();
        var bundle = bundleSavings();
        var net = sub - bundle;
        var disc = bundle + couponAmount(net);
        if (disc > sub) disc = sub;
        var taxed = (sub - disc) * TAX_RATE;
        var total = sub - disc + taxed;
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
        set('coSubtotal', money(sub));
        var dl = document.getElementById('coDiscLine');
        if (dl) dl.hidden = disc <= 0;
        set('coDiscount', '−' + money(disc));
        set('coTax', money(taxed));
        set('coTotal', money(total));
        var rob = document.getElementById('coRobuxAmt'); if (rob) rob.textContent = window.__robux ? window.__robux(total) : ('R$ ' + Math.round(total * 80));

        var fx = document.getElementById('coFx');
        if (fx) {
          var cur = window.__currency ? window.__currency() : 'usd';
          fx.textContent = (window.__money && window.__money(total) !== usd(total))
            ? 'Charged in USD (' + usd(total) + '). Shown in your selected currency (' + money(total) + ').'
            : 'All prices in USD. Card is charged in USD.';
        }
        return total;
      }
      function render() { renderItems(); renderTotals(); updateResell(); }

      function updateResell() {
        var wrap = document.getElementById('coResellWrap');
        if (wrap) wrap.hidden = !cart.some(function (i) { return i.licence === 'resell'; });
      }

      var loggedIn = window.__isLoggedIn && window.__isLoggedIn();
      var g = document.getElementById('coGuest'), u = document.getElementById('coUser'), mode = document.getElementById('coMode');
      if (loggedIn) { if (g) g.hidden = true; if (u) u.hidden = false; if (mode) mode.textContent = 'Signed in'; }
      var coSignin = document.getElementById('coSignin');
      if (coSignin) coSignin.addEventListener('click', function (e) { e.preventDefault(); var b = document.getElementById('accountBtn'); if (b) b.click(); });

      var applyBtn = document.getElementById('coApply'), cInput = document.getElementById('coCoupon'), cMsg = document.getElementById('coCouponMsg');
      if (applyBtn) applyBtn.addEventListener('click', function () {
        var code = (cInput.value || '').trim().toUpperCase();
        if (COUPONS[code]) { coupon = COUPONS[code]; cMsg.textContent = 'Applied ' + coupon.label; cMsg.className = 'co-coupon-msg ok'; }
        else { coupon = null; cMsg.textContent = code ? 'That code isn\'t valid.' : ''; cMsg.className = 'co-coupon-msg no'; }
        renderTotals();
      });

      document.querySelectorAll('.co-pay-tab').forEach(function (t) {
        t.addEventListener('click', function () {
          document.querySelectorAll('.co-pay-tab').forEach(function (x) { x.classList.toggle('active', x === t); });
          var pay = t.getAttribute('data-pay');
          var c = document.getElementById('payCard'), r = document.getElementById('payRobux');
          if (c) c.hidden = pay !== 'card'; if (r) r.hidden = pay !== 'robux';
        });
      });

      function buildSuggestions() {
        var box = document.getElementById('coSuggest'), list = document.getElementById('coSuggestList');
        if (!box || !list) return;
        var cat = (window.__CATALOG || []);
        var have = {}; cart.forEach(function (i) { have[i.title] = 1; });
        var picks = cat.filter(function (p) { return !have[p.title]; }).slice(0, 3);
        if (!picks.length || !cart.length) { box.hidden = true; return; }
        box.hidden = false; list.innerHTML = '';
        picks.forEach(function (p) {
          var base = parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
          var now = Math.round(base * 0.8 * 100) / 100;
          var el = document.createElement('div'); el.className = 'co-suggest-item';
          el.innerHTML = '<span class="co-sg-thumb" style="background-image:url(\'' + p.image + '\')"></span>' +
            '<div class="co-sg-info"><div class="co-sg-title">' + p.title + '</div>' +
            '<div class="co-sg-price"><span class="co-sg-was">' + money(base) + '</span><span class="co-sg-now">' + money(now) + '</span></div></div>' +
            '<button class="co-sg-add" type="button">Add</button>';
          el.querySelector('.co-sg-add').addEventListener('click', function () {
            var id = (p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '--bundle';
            if (!cart.some(function (i) { return i.id === id; })) {
              cart.push({ id: id, title: p.title, price: now, basePrice: base, image: p.image, tag: p.cat || '', licence: 'standard', qty: 1 });
              save(cart); render(); buildSuggestions();
            }
          });
          list.appendChild(el);
        });
      }

      var placeBtn = document.getElementById('coPlace'), msg = document.getElementById('coMsg'), agreeErr = document.getElementById('coAgreeErr');
      function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
      if (placeBtn) placeBtn.addEventListener('click', function () {
        if (!cart.length) { return; }
        var ok = true;
        if (!loggedIn) {
          var em = (document.getElementById('co-email') || {}).value || '';
          var ef = root.querySelector('.auth-field[data-for="email"]');
          if (!emailOk(em.trim())) { ok = false; if (ef) { ef.classList.add('invalid'); ef.querySelector('.auth-err').textContent = 'Enter a valid email for your receipt.'; } }
          else if (ef) { ef.classList.remove('invalid'); ef.querySelector('.auth-err').textContent = ''; }
        }
        var tos = document.getElementById('coTos'), resellWrap = document.getElementById('coResellWrap'), resell = document.getElementById('coResell');
        var agreeMsgs = [];
        if (tos && !tos.checked) { ok = false; agreeMsgs.push('accept the Terms of Service'); }
        if (resellWrap && !resellWrap.hidden && resell && !resell.checked) { ok = false; agreeMsgs.push('accept the Resell Licence Terms'); }
        if (agreeErr) agreeErr.textContent = agreeMsgs.length ? 'Please ' + agreeMsgs.join(' and ') + '.' : '';
        var payCardOn = document.querySelector('.co-pay-tab.active') && document.querySelector('.co-pay-tab.active').getAttribute('data-pay') === 'card';
        if (payCardOn) {
          var card = (document.getElementById('co-card') || {}).value || '';
          var cf = root.querySelector('.auth-field[data-for="card"]');
          if (card.replace(/\s/g, '').length < 12) { ok = false; if (cf) { cf.classList.add('invalid'); cf.querySelector('.auth-err').textContent = 'Enter a valid card number.'; } }
          else if (cf) { cf.classList.remove('invalid'); cf.querySelector('.auth-err').textContent = ''; }
        }
        if (!ok) { if (msg) { msg.className = 'co-msg err show'; msg.textContent = 'Please fix the highlighted fields above.'; } return; }
        if (msg) { msg.className = 'co-msg show'; msg.textContent = 'Order placed (demo). Connect Stripe/Robux on the backend to charge for real and email a receipt.'; }
        cart = []; save(cart); render(); buildSuggestions();
        window.dispatchEvent(new Event('currencychange'));
      });

      window.addEventListener('currencychange', function () { renderTotals(); renderItems(); buildSuggestions(); });
      render(); buildSuggestions();
    })();

    (function () {
      var loader = document.getElementById('pageLoader');
      if (!loader) return;
      var DELAY = 2500;
      document.addEventListener('click', function (e) {
        var tile = e.target.closest('.bento .tile');
        if (!tile) return;
        var href = tile.getAttribute('href');
        if (!href) return;
        e.preventDefault();
        e.stopPropagation();
        loader.hidden = false;
        requestAnimationFrame(function () { loader.classList.add('show'); });
        var base = href.split('?')[0];
        var view = base === 'index.html' ? 'home' : base.replace('.html', '');
        setTimeout(function () {
          if (window.__go) {
            window.__go(view, 'all');
            loader.classList.remove('show');
            setTimeout(function () { loader.hidden = true; }, 320);
          } else {
            window.location.href = href;
          }
        }, DELAY);
      }, true);
    })();
