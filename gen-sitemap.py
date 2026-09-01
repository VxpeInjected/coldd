#!/usr/bin/env python3
"""Regenerate sitemap.xml.

The catalog lives in Supabase, not in the repo, so the product URLs cannot be
derived from the checked-in files. This pulls the active products over the
public REST endpoint with the same publishable key the site itself ships, and
falls back to the static pages alone if the network is unavailable.

Blog posts and tutorials come from the `content` table when it has rows, and
otherwise from the SEED arrays in blog.js, which is the same precedence the
front end applies.

Usage:  python3 gen-sitemap.py
"""
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent
ORIGIN = 'https://coldd.dev'
SUPABASE_URL = 'https://ekinmytmudjwfaqaqswp.supabase.co'
SUPABASE_KEY = 'sb_publishable_q5JwjFnMT_0Uhu5rAlAkQA_DEGnhwV7'
TIMEOUT = 20

# path, changefreq, priority. Auth, checkout, dashboard and success are
# deliberately absent: they carry noindex and are disallowed in robots.txt.
STATIC_PAGES = [
    ('/', 'weekly', '1.0'),
    ('/shop', 'weekly', '0.9'),
    ('/blog', 'weekly', '0.7'),
    ('/blog?view=tutorials', 'weekly', '0.7'),
    ('/releases', 'weekly', '0.6'),
    ('/faq', 'monthly', '0.6'),
    ('/about', 'monthly', '0.5'),
    ('/resell-license', 'yearly', '0.3'),
    ('/terms-of-service', 'yearly', '0.2'),
    ('/privacy-policy', 'yearly', '0.2'),
    ('/refund-policy', 'yearly', '0.2'),
]


def fetch(path):
    req = urllib.request.Request(
        SUPABASE_URL + '/rest/v1/' + path,
        headers={'apikey': SUPABASE_KEY, 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def iso_day(value):
    """Normalise a Postgres timestamp to YYYY-MM-DD, or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).date().isoformat()
    except ValueError:
        return str(value)[:10] or None


def products():
    try:
        rows = fetch('products?select=slug,updated_at,created_at,is_active&is_active=eq.true')
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print('  ! products unavailable (%s) - writing static pages only' % e, file=sys.stderr)
        return []
    out = []
    for r in rows:
        if not r.get('slug'):
            continue
        out.append(('/product?id=' + r['slug'],
                    'weekly', '0.8',
                    iso_day(r.get('updated_at') or r.get('created_at'))))
    return out


def seed_slugs(kind):
    """Pull slugs out of the SEED_POSTS / SEED_TUTORIALS arrays in blog.js."""
    js = (ROOT / 'blog.js').read_text()
    m = re.search(r'SEED_%s\s*=\s*\[(.*?)\n\s*\];' % kind, js, re.S)
    if not m:
        return []
    body = m.group(1)
    slugs = re.findall(r"slug:\s*'([^']+)'", body)
    dates = re.findall(r"date:\s*'(\d{4}-\d{2}-\d{2})'", body)
    return list(zip(slugs, dates + [None] * (len(slugs) - len(dates))))


def content(kind, path_fmt, priority):
    """Live `content` rows if present, else the blog.js seeds."""
    rows = []
    try:
        rows = fetch("content?select=slug,data,visible&type=eq.%s" % kind)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        rows = []
    if rows:
        return [(path_fmt % r['slug'], 'monthly', priority,
                 iso_day((r.get('data') or {}).get('date')))
                for r in rows if r.get('slug') and r.get('visible') is not False]
    seeds = seed_slugs('POSTS' if kind == 'post' else 'TUTORIALS')
    return [(path_fmt % slug, 'monthly', priority, d) for slug, d in seeds]


def esc(u):
    return u.replace('&', '&amp;')


def main():
    today = date.today().isoformat()
    entries = [(p, f, pr, today) for p, f, pr in STATIC_PAGES]
    entries += products()
    entries += content('post', '/post?slug=%s', '0.6')
    entries += content('tutorial', '/tutorial?slug=%s', '0.6')

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, freq, prio, lastmod in entries:
        lines.append('  <url>')
        lines.append('    <loc>%s%s</loc>' % (ORIGIN, esc(path)))
        if lastmod:
            lines.append('    <lastmod>%s</lastmod>' % lastmod)
        lines.append('    <changefreq>%s</changefreq>' % freq)
        lines.append('    <priority>%s</priority>' % prio)
        lines.append('  </url>')
    lines.append('</urlset>')

    (ROOT / 'sitemap.xml').write_text('\n'.join(lines) + '\n')
    print('Wrote sitemap.xml  (%d URLs: %d static, %d dynamic)'
          % (len(entries), len(STATIC_PAGES), len(entries) - len(STATIC_PAGES)))


if __name__ == '__main__':
    main()
