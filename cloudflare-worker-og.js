// coldd.dev - social preview (Open Graph / Twitter Card) injector.
//
// Why this exists: /product and /post are single static shells that render
// whichever record the query string names entirely client-side (see
// window.coldSeo in catalog.js). That's enough for Google, which renders
// JS - but Discord, X, Slack, iMessage and WhatsApp link-preview bots fetch
// the raw HTML only and never run a script, so every shared product or post
// link showed the same generic banner.jpg and "Product - coldd Development"
// title. This Worker rewrites the <head> tags at the edge, before the
// response reaches the client, so those crawlers see the real one.
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create -> paste this
// file -> Deploy. Then add a route so it sits in front of the site:
// Workers & Pages -> your worker -> Settings -> Triggers -> Add route
//   coldd.dev/product*   (zone: coldd.dev)
//   coldd.dev/post*      (zone: coldd.dev)
// No route is needed for any other path - everything else passes through
// untouched via fetch(request), so this can't break the rest of the site.
//
// No secrets required: SUPABASE_ANON_KEY below is the same public anon key
// already embedded in supabase-init.js on every page (protected by RLS, not
// secrecy), so hardcoding it here carries no additional exposure.

const SUPABASE_URL = 'https://ekinmytmudjwfaqaqswp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q5JwjFnMT_0Uhu5rAlAkQA_DEGnhwV7';
const ORIGIN = 'https://coldd.dev';

function escAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function clamp(text, max) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  var cut = t.slice(0, max);
  var sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

function absoluteImage(url) {
  if (!url) return ORIGIN + '/banner.jpg';
  if (/^https?:\/\//.test(url)) return url;
  return ORIGIN + (url.charAt(0) === '/' ? '' : '/') + url;
}

async function fetchProduct(id) {
  var url = SUPABASE_URL + '/rest/v1/products?slug=eq.' + encodeURIComponent(id) +
    '&is_active=eq.true&select=title,description,image,cat,platform&limit=1';
  var res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
  if (!res.ok) return null;
  var rows = await res.json();
  var p = rows[0];
  if (!p) return null;
  return {
    title: p.title + ' - coldd Development',
    description: clamp(p.description || (p.title + ', a ' + (p.cat || 'game') + ' asset for ' + (p.platform || 'Roblox') + ' from coldd.'), 300),
    image: absoluteImage(p.image),
    type: 'product',
    path: '/product/' + encodeURIComponent(id)
  };
}

async function fetchPost(slug) {
  var url = SUPABASE_URL + '/rest/v1/content?slug=eq.' + encodeURIComponent(slug) +
    '&type=eq.post&visible=eq.true&select=data&limit=1';
  var res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
  if (!res.ok) return null;
  var rows = await res.json();
  var d = rows[0] && rows[0].data;
  if (!d) return null;
  return {
    title: 'coldd Blog - ' + d.title,
    description: clamp(d.dek || d.title, 300),
    image: absoluteImage(d.cover),
    type: 'article',
    path: '/post?slug=' + encodeURIComponent(slug)
  };
}

function rewriteHead(html, meta) {
  var url = ORIGIN + meta.path;
  var replacements = [
    [/<title>[^<]*<\/title>/, '<title>' + escAttr(meta.title) + '</title>'],
    [/<link rel="canonical" href="[^"]*" \/>/, '<link rel="canonical" href="' + escAttr(url) + '" />'],
    [/<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="' + escAttr(meta.description) + '" />'],
    [/<meta property="og:type" content="[^"]*" \/>/, '<meta property="og:type" content="' + escAttr(meta.type) + '" />'],
    [/<meta property="og:url" content="[^"]*" \/>/, '<meta property="og:url" content="' + escAttr(url) + '" />'],
    [/<meta property="og:title" content="[^"]*" \/>/, '<meta property="og:title" content="' + escAttr(meta.title) + '" />'],
    [/<meta property="og:description" content="[^"]*" \/>/, '<meta property="og:description" content="' + escAttr(meta.description) + '" />'],
    [/<meta property="og:image" content="[^"]*" \/>/, '<meta property="og:image" content="' + escAttr(meta.image) + '" />'],
    [/<meta property="og:image:alt" content="[^"]*" \/>/, '<meta property="og:image:alt" content="' + escAttr(meta.title) + '" />'],
    [/<meta name="twitter:title" content="[^"]*" \/>/, '<meta name="twitter:title" content="' + escAttr(meta.title) + '" />'],
    [/<meta name="twitter:description" content="[^"]*" \/>/, '<meta name="twitter:description" content="' + escAttr(meta.description) + '" />'],
    [/<meta name="twitter:image" content="[^"]*" \/>/, '<meta name="twitter:image" content="' + escAttr(meta.image) + '" />']
  ];
  replacements.forEach(function (pair) { html = html.replace(pair[0], pair[1]); });
  // The static tags describe banner.jpg's fixed 1920x1080. A product/post
  // image is a different shape, so stale dimensions would letterbox the card.
  html = html.replace(/<meta property="og:image:width" content="[^"]*" \/>\s*/, '');
  html = html.replace(/<meta property="og:image:height" content="[^"]*" \/>\s*/, '');
  return html;
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    // The canonical product URL is path-based (/product/<slug>); the old
    // query form (/product?id=<slug>) still resolves for any link that
    // predates the change. Posts stay on /post?slug=<slug>.
    var prodPath = url.pathname.match(/^\/product\/([^\/]+)\/?$/);
    var isProduct = !!prodPath || url.pathname === '/product' || url.pathname === '/product/';
    var isPost = url.pathname === '/post' || url.pathname === '/post/';
    if (!isProduct && !isPost) return fetch(request);

    var id = prodPath ? decodeURIComponent(prodPath[1])
      : isProduct ? url.searchParams.get('id')
      : url.searchParams.get('slug');
    if (!id) return fetch(request);

    // /product/<slug> has no file on the static origin, so fetch the shell;
    // a plain /product(/) or /post(/) request fetches itself.
    var originResponse = await fetch(prodPath ? (ORIGIN + '/product/') : request);
    var contentType = originResponse.headers.get('content-type') || '';
    if (!contentType.includes('text/html') || !originResponse.ok) return originResponse;

    try {
      var meta = isProduct ? await fetchProduct(id) : await fetchPost(id);
      if (!meta) return originResponse;

      var html = await originResponse.text();
      html = rewriteHead(html, meta);
      var headers = new Headers(originResponse.headers);
      return new Response(html, { status: 200, headers: headers });
    } catch (e) {
      // Any failure (Supabase down, bad data) falls back to the untouched
      // origin response rather than breaking the page.
      return originResponse;
    }
  }
};
