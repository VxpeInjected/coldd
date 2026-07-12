#!/usr/bin/env python3
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).parent
IMG_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')

def b64_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{data}'

DATA_URIS = {
    p.name: b64_data_uri(p)
    for p in ROOT.iterdir()
    if p.suffix.lower() in IMG_EXT
}

def inline_images(text: str) -> str:
    def repl_url(m):
        quote, name = m.group('q') or '', m.group('name')
        base = name.split('/')[-1]
        return f"url({quote}{DATA_URIS.get(base, name)}{quote})" if base in DATA_URIS else m.group(0)

    text = re.sub(r"url\((?P<q>['\"]?)(?P<name>[^)'\"]+)(?P=q)\)", repl_url, text)

    def repl_src(m):
        name = m.group('name').split('/')[-1]
        return f'src="{DATA_URIS[name]}"' if name in DATA_URIS else m.group(0)

    text = re.sub(r'src="(?P<name>[^"]+)"', repl_src, text)
    return text

def extract_main(html: str) -> str:
    m = re.search(r'<main\b[^>]*>.*?</main>', html, re.S)
    return m.group(0)

def humanize(slug: str) -> str:
    return slug.replace('-', ' ').replace(' ui', ' UI').title().replace(' And ', ' & ').replace('Ui', 'UI').replace('Vfx', 'VFX')

def parse_categories(html: str, platform: str, page: str):
    cats = []
    for slug, label in re.findall(r'<button class="fc-cat[^"]*" data-cat="([^"]+)"><span>(.*?)</span>', html):
        if slug == 'all':
            continue
        cats.append({'label': label.replace('&amp;', '&').strip(), 'slug': slug,
                     'platform': platform, 'page': page})
    return cats

def parse_catalog(html: str, platform: str, page: str):
    items = []
    for block in re.findall(r'<article class="product".*?</article>', html, re.S):
        cat_m = re.search(r'data-cat="([^"]+)"', block)
        img_m = re.search(r"background-image:url\('([^']+)'\)", block)
        title_m = re.search(r'<h3[^>]*>(.*?)</h3>', block, re.S)
        price_m = re.search(r'p-price">(.*?)</span>', block, re.S)
        catlabel_m = re.search(r'data-catlabel="([^"]+)"', block)
        if not (title_m and price_m):
            continue
        unesc = lambda s: s.replace('&amp;', '&').strip()
        cat_label = unesc(catlabel_m.group(1)) if catlabel_m else (humanize(cat_m.group(1)) if cat_m else '')
        items.append({
            'title': unesc(title_m.group(1)),
            'price': unesc(price_m.group(1)),
            'image': img_m.group(1) if img_m else '',
            'cat': cat_label,
            'platform': platform,
            'page': page,
        })
    return items

index_html = (ROOT / 'index.html').read_text()
assets_html = (ROOT / 'assets.html').read_text()
minecraft_html = (ROOT / 'minecraft.html').read_text()
about_html = (ROOT / 'about.html').read_text()
dashboard_html = (ROOT / 'dashboard.html').read_text()
checkout_html = (ROOT / 'checkout.html').read_text()
css = (ROOT / 'styles.css').read_text()
app_js = (ROOT / 'app.js').read_text()

orig_home_main = extract_main(index_html)
home_main = re.sub(r'<main\b[^>]*>', '<main id="view-home">', orig_home_main, count=1)
assets_main = re.sub(r'<main\b[^>]*>', '<main class="page" id="view-assets" hidden>',
                     extract_main(assets_html), count=1)
minecraft_main = re.sub(r'<main\b[^>]*>', '<main class="page" id="view-minecraft" hidden>',
                        extract_main(minecraft_html), count=1)
about_main = re.sub(r'<main\b[^>]*>', '<main class="page about" id="view-about" hidden>',
                    extract_main(about_html), count=1)
dashboard_main = re.sub(r'<main\b[^>]*>', '<main class="page dash-page" id="view-dashboard" hidden>',
                        extract_main(dashboard_html), count=1)
checkout_main = re.sub(r'<main\b[^>]*>', '<main class="page checkout-page" id="view-checkout" hidden>',
                       extract_main(checkout_html), count=1)

ROUTER = r"""
    (function () {
      var views = {
        home: document.getElementById('view-home'),
        assets: document.getElementById('view-assets'),
        minecraft: document.getElementById('view-minecraft'),
        about: document.getElementById('view-about'),
        dashboard: document.getElementById('view-dashboard'),
        checkout: document.getElementById('view-checkout')
      };
      if (!views.home) return;
      window.__go = swap;
      var megas = [document.getElementById('navMega')].filter(Boolean);
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var animating = false, current = 'home';

      function applyCatTo(view, cat) {
        var shop = view && view.querySelector('.shop');
        if (shop && shop.__applyCat) shop.__applyCat(cat || 'all');
      }
      function swap(name, cat) {
        var inEl = views[name]; if (!inEl) return;
        if (name === current) { applyCatTo(inEl, cat); return; }
        var outEl = views[current];
        megas.forEach(function (m) { m.classList.remove('open'); });
        var finish = function () {
          outEl.hidden = true; outEl.classList.remove('page-leaving');
          applyCatTo(inEl, cat);
          inEl.hidden = false;
          inEl.style.animation = 'none'; void inEl.offsetWidth; inEl.style.animation = '';
          window.scrollTo(0, 0); window.dispatchEvent(new Event('resize'));
          current = name; animating = false;
        };
        if (reduce) { finish(); return; }
        if (animating) return;
        animating = true;
        outEl.classList.add('page-leaving');
        setTimeout(finish, 165);
      }

      document.addEventListener('click', function (e) {
        var a = e.target.closest('a'); if (!a) return;
        var href = a.getAttribute('href') || '';
        if (href === 'index.html') { e.preventDefault(); swap('home'); }
        else if (href === 'assets.html') { e.preventDefault(); swap('assets', 'all'); }
        else if (href.indexOf('assets.html?cat=') === 0) { e.preventDefault(); swap('assets', href.split('=')[1]); }
        else if (href === 'minecraft.html') { e.preventDefault(); swap('minecraft', 'all'); }
        else if (href.indexOf('minecraft.html?cat=') === 0) { e.preventDefault(); swap('minecraft', href.split('=')[1]); }
        else if (href === 'about.html') { e.preventDefault(); swap('about'); }
        else if (href === 'dashboard.html') { e.preventDefault(); swap('dashboard'); }
        else if (href === 'checkout.html') { e.preventDefault(); swap('checkout'); }
        else if (href.charAt(0) === '#' && href.length > 1 && current === 'home') {
          e.preventDefault();
          var t = document.querySelector(href);
          if (t) t.scrollIntoView({ behavior: 'smooth' });
        }
      });
    })();
"""

import json
catalog = parse_catalog(assets_html, 'Roblox', 'assets.html') + \
          parse_catalog(minecraft_html, 'Minecraft', 'minecraft.html')
categories = parse_categories(assets_html, 'Roblox', 'assets.html')
cats_js = 'window.__CATEGORIES = ' + json.dumps(categories, ensure_ascii=False) + ';\n'

(ROOT / 'catalog.js').write_text(
    'window.__CATALOG = ' + json.dumps(catalog, ensure_ascii=False) + ';\n' + cats_js)
print('Wrote catalog.js  (%d products, %d categories)' % (len(catalog), len(categories)))

catalog_inline = [dict(it, image=DATA_URIS.get(it['image'], it['image'])) for it in catalog]
catalog_js = 'window.__CATALOG = ' + json.dumps(catalog_inline, ensure_ascii=False) + ';\n' + cats_js

combined_script = 'window.__singleFile = true;\n' + catalog_js + app_js + '\n' + ROUTER

out = index_html
out = out.replace(orig_home_main,
                  home_main + '\n  ' + assets_main + '\n  ' + minecraft_main + '\n  ' + about_main + '\n  ' + dashboard_main + '\n  ' + checkout_main, 1)
out = out.replace('<link rel="stylesheet" href="styles.css" />',
                  '<style>\n' + css + '\n</style>')
out = out.replace('  <script src="catalog.js"></script>\n', '')
out = out.replace('<script src="app.js"></script>',
                  '<script>\n' + combined_script + '\n</script>')
out = inline_images(out)
out = out.replace('href="logo.png"', 'href="' + DATA_URIS['logo.png'] + '"')

(ROOT / 'coldd-site.html').write_text(out)
print('Wrote coldd-site.html  (%.1f KB)' % ((ROOT / 'coldd-site.html').stat().st_size / 1024))
