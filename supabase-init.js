(function () {
  var SUPABASE_URL = 'https://ekinmytmudjwfaqaqswp.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_q5JwjFnMT_0Uhu5rAlAkQA_DEGnhwV7';
  // Set this to your Coldd Development Discord server's guild ID to enable
  // per-member role/nickname lookups via the guilds.members.read scope.
  // Leave empty to skip that lookup (guild LIST still works either way).
  var TARGET_GUILD_ID = '1247414059909779578';
  var PROFILE_KEY = 'coldd_profile';
  var AUTH_KEY = 'coldd_auth';

  // Roblox OAuth app client ID (public, safe to inline - same as the
  // Discord guild ID above). Set once the OAuth app is created at
  // create.roblox.com/dashboard/credentials/oauth; account linking is a
  // no-op until then.
  var ROBLOX_OAUTH_CLIENT_ID = '6729807859304248011';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[coldd] Supabase SDK failed to load.');
    return;
  }
  // Session (access + refresh token) storage. This was sessionStorage -
  // cleared the moment the tab/browser closes, which shrinks how long a
  // stolen token (XSS, shared machine) stays useful, but also meant every
  // visitor got signed out just from closing their browser. Moved to
  // localStorage (supabase-js's own default) to actually persist across
  // sessions like a normal site login. This is not a security downgrade
  // relative to a plain cookie - a JS-readable cookie is exactly as
  // exposed to XSS as localStorage is, since what matters is whether JS
  // can read it, not which API it's stored behind. The real fix for that
  // class of exposure is httpOnly cookies plus a server that mediates
  // every Supabase call, which is a proxy-layer architecture change this
  // static site doesn't have yet, not a storage flag.
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: window.localStorage }
  });
  window.coldSupabase = client;

  // Site-wide error capture: uncaught JS errors, unhandled promise
  // rejections, and failed Edge Function calls, from any visitor - signed
  // in or not, since errors often happen exactly when something (like
  // auth) is already broken. Each report gets a short code a visitor can
  // actually read back to support ("it said ERR-4K9X2P"), which shows up
  // next to staff actions in the admin audit log. See
  // supabase/client_errors.sql for the table this writes to - insert is
  // open to anon on purpose (a write-only report can't leak anything back
  // to the reporter), select is admin-only.
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - hand-copied into a support message
  function genErrorCode() {
    var s = '';
    for (var i = 0; i < 6; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    return 'ERR-' + s;
  }
  function logClientError(kind, message, stack, extra) {
    try {
      var code = genErrorCode();
      var session = null;
      client.auth.getSession().then(function (res) {
        var uid = (res && res.data && res.data.session && res.data.session.user && res.data.session.user.id) || null;
        var row = {
          code: code, kind: kind, message: String(message || '').slice(0, 2000),
          stack: stack ? String(stack).slice(0, 8000) : null,
          fn_name: (extra && extra.fnName) || null,
          page_url: location.href, user_agent: navigator.userAgent, user_id: uid,
          context: (extra && extra.context) || null
        };
        client.from('client_errors').insert(row).catch(function () {});
      }).catch(function () {});
      return code;
    } catch (e) { return null; }
  }
  window.addEventListener('error', function (e) {
    // Cross-origin scripts (the Google Fonts stylesheet, jsDelivr's
    // Supabase SDK bundle) report as "Script error." with no stack when
    // something inside them throws - nothing actionable to log there.
    if (!e || e.message === 'Script error.') return;
    logClientError('js_error', e.message, e.error && e.error.stack, { context: { line: e.lineno, col: e.colno, src: e.filename } });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    var message = (reason && (reason.message || String(reason))) || 'Unhandled rejection';
    logClientError('unhandled_rejection', message, reason && reason.stack);
  });

  // supabase-js's functions.invoke() does NOT parse the JSON body into
  // res.data on a non-2xx response - it's null, and res.error.message is
  // always the generic "Edge Function returned a non-2xx status code".
  // The real error body lives on res.error.context (the raw Response).
  function invokeFn(name, body) {
    return client.functions.invoke(name, { body: body || {} }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        var parsed = (ctx && typeof ctx.json === 'function') ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
        return parsed.then(function (data) {
          var msg = (data && data.error) || res.error.message || 'Request failed.';
          logClientError('edge_function', msg, null, { fnName: name, context: { status: ctx && ctx.status } });
          var err = new Error(msg);
          if (data && data.code) err.code = data.code;
          throw err;
        });
      }
      if (!res.data || !res.data.ok) {
        var failMsg = (res.data && res.data.error) || 'Request failed.';
        logClientError('edge_function', failMsg, null, { fnName: name });
        var failErr = new Error(failMsg);
        if (res.data && res.data.code) failErr.code = res.data.code;
        throw failErr;
      }
      return res.data;
    });
  }

  // Real access check, backed by profiles.is_admin/role (RLS-enforced -
  // this is the same flag every admin-* Edge Function checks server-side,
  // not a separate client-side list). role is 'owner'/'admin'/'support',
  // set manually via SQL for now; a signed-in admin with is_admin=true but
  // no role yet defaults to 'admin' so existing staff aren't locked out.
  function checkIsAdmin() {
    return client.auth.getUser().then(function (res) {
      var user = res && res.data && res.data.user;
      if (!user) return { isAdmin: false, role: null, username: null, id: null };
      return client.from('profiles').select('is_admin, role, username, email').eq('id', user.id).single().then(function (pRes) {
        if (pRes.error || !pRes.data) return { isAdmin: false, role: null, username: null, id: user.id };
        var isAdmin = !!pRes.data.is_admin;
        return {
          isAdmin: isAdmin,
          role: pRes.data.role || (isAdmin ? 'admin' : null),
          username: pRes.data.username || pRes.data.email || null,
          id: user.id
        };
      });
    }).catch(function () { return { isAdmin: false, role: null, username: null, id: null }; });
  }

  var REF_KEY = 'coldd_ref_code';
  // Captures ?ref=CODE off any page URL (referral link click), stores it for
  // attribution at signup time, and fires a vanity click count. Runs on
  // every page load, not just signup/signin pages, since a referral link
  // can point anywhere on the site.
  (function captureReferralClick() {
    try {
      var m = /[?&]ref=([^&]+)/.exec(location.search);
      if (!m) return;
      var code = decodeURIComponent(m[1]).trim().toLowerCase();
      if (!code) return;
      localStorage.setItem(REF_KEY, code);
      invokeFn('track-referral-click', { code: code }).catch(function () {});
    } catch (e) {}
  })();
  function attributeReferral() {
    var code = null;
    try { code = localStorage.getItem(REF_KEY); } catch (e) {}
    if (!code) return Promise.resolve();
    return invokeFn('track-referral-signup', { code: code }).catch(function () {});
  }

  var CAMPAIGN_KEY = 'coldd_campaign_code';
  // Captures ?cmp=CODE the same way captureReferralClick() captures ?ref= -
  // a separate query param and separate table on purpose, since campaign
  // links are admin-managed marketing links (partners, sponsors), not the
  // user-to-user referral program. Read by checkout at order-creation time
  // via getCampaignCode(), not attributed to a signed-in profile the way
  // referrals are, so it works for guest checkouts too.
  (function captureCampaignClick() {
    try {
      var m = /[?&]cmp=([^&]+)/.exec(location.search);
      if (!m) return;
      var code = decodeURIComponent(m[1]).trim().toLowerCase();
      if (!code) return;
      localStorage.setItem(CAMPAIGN_KEY, code);
      invokeFn('track-campaign-click', { code: code }).catch(function () {});
    } catch (e) {}
  })();
  function getCampaignCode() {
    try { return localStorage.getItem(CAMPAIGN_KEY); } catch (e) { return null; }
  }

  // Captures ?bundle=TOKEN the same way - a wishlist-reminder or
  // post-purchase-upsell email links back with one, and checkout reads it
  // from here (coldd_bundle_token) rather than the URL directly, since the
  // buyer may click around (wishlist -> product page -> checkout) before
  // actually placing the order. priceItems() silently ignores an
  // expired/unknown one, so there's no harm in always carrying whatever
  // was last captured.
  (function captureBundleToken() {
    try {
      var m = /[?&]bundle=([^&]+)/.exec(location.search);
      if (!m) return;
      var token = decodeURIComponent(m[1]).trim();
      if (!token) return;
      localStorage.setItem('coldd_bundle_token', token);
    } catch (e) {}
  })();

  function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} }
  function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { return null; } }
  function clearProfile() { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }
  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] || '').toUpperCase();
  }
  // Discord identities already carry a real avatar from callback.html, so
  // this never overrides one. Every other provider (Google, email, and
  // Roblox when Roblox's own API returns none) saved avatar: '' outright -
  // a generated identicon reads as an intentional default for those,
  // rather than the plain-letter initials circle looking like a broken
  // image that never loaded. Seeded on the account id so it's stable for
  // that person forever, not re-rolled on every page load.
  function avatarUrlFor(p) {
    if (!p) return '';
    if (p.avatar) return p.avatar;
    if (p.provider === 'discord') return '';
    var seed = p.id || p.email || p.name || 'coldd';
    return 'https://api.dicebear.com/9.x/identicon/svg?seed=' + encodeURIComponent(seed) + '&backgroundType=solid&backgroundColor=1f2127';
  }
  function capitalizeEmailPrefix(email) {
    if (!email) return '';
    var prefix = email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  function applyProfile() {
    var p = getProfile();
    if (!p) return;
    // p.name already IS the right value here - upsertBasicProfile only
    // ever derives it from the email prefix as a fallback for brand-new
    // signups (see its own comment), and keeps whatever the user set via
    // Account Settings from then on. Unconditionally recomputing it from
    // the email here for every email-provider user threw that custom name
    // away everywhere applyProfile paints it (nav, dashboard header) even
    // though Account Settings itself (which reads p.name directly) showed
    // it saved correctly - "I changed my name and nothing changed."
    // capitalizeEmailPrefix is now only a last-resort fallback if p.name
    // is somehow empty.
    var displayName = p.name || (p.provider === 'email' ? capitalizeEmailPrefix(p.email) : '') || 'Member';

    document.querySelectorAll('#dashName, #coUserName').forEach(function (el) { el.textContent = displayName; });
    document.querySelectorAll('#dashEmail, #coUserEmail').forEach(function (el) { el.textContent = p.email || ''; });

    function paintAvatar(url) {
      document.querySelectorAll('#dashAvatar, #coAvatar, #acAvatarPreview').forEach(function (el) {
        if (url) {
          el.style.backgroundImage = 'url(' + url + ')';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          // NOT '' - the CSS skeleton-loading pulse is keyed off :empty,
          // which this element only ever satisfies BEFORE a real avatar
          // loads (a background-image doesn't count as content). Leaving
          // it truly empty here made it look "loaded" to the eye but
          // still match :empty forever, so the placeholder pulse never
          // actually turned off - a zero-width space is invisible but is
          // real text content, which is enough to stop matching :empty.
          el.textContent = '​';
        } else {
          el.style.backgroundImage = '';
          el.textContent = initials(displayName);
        }
      });
    }
    paintAvatar(avatarUrlFor(p));

    // profiles.avatar_url persists server-side regardless of which provider
    // the CURRENT session used to sign in - p above only reflects this
    // session's provider, so a user who linked Discord (or uploaded a
    // custom picture via Account Settings) but is now signed in via email/
    // Google/Roblox would otherwise never see it. Whatever's on record wins
    // over the synchronous provider/identicon default above, once this
    // resolves - a self-uploaded avatar is exactly as durable as a linked
    // Discord one, same column, same "always wins" rule.
    if (client && p.id) {
      client.from('profiles').select('avatar_url').eq('id', p.id).maybeSingle()
        .then(function (res) {
          var row = res && res.data;
          if (row && row.avatar_url) paintAvatar(row.avatar_url);
        })
        .catch(function () {});
    }

    // The separator lives here, not in the markup: the heading ships as
    // "Welcome back." with an empty span, so a profile that never loads reads
    // as a plain greeting rather than a dangling comma.
    var welcome = document.getElementById('dashWelcomeName');
    if (welcome) {
      var first = (displayName || '').split(' ')[0] || displayName;
      welcome.textContent = first ? ', ' + first : '';
    }

    var acName = document.getElementById('ac-name');
    if (acName) acName.value = displayName || '';
    var acEmail = document.getElementById('ac-email');
    if (acEmail) acEmail.value = p.email || '';

  }

  // Returns the promise chain (callers must return/await it) - every
  // caller used to fire this and resolve immediately, so a fast
  // isEmailVerified() round trip could win the race and redirect to
  // /dashboard before saveProfile() ever ran. That left coldd_profile
  // unset in localStorage: applyProfile() found nothing to apply, so the
  // account menu and dashboard rendered a bare "?" avatar with no name
  // even though the real session (and the purchase history it drives)
  // was completely valid - not a data leak, just a lost race.
  function upsertBasicProfile(user) {
    var email = user.email || '';
    var derivedName = (user.user_metadata && (user.user_metadata.username || user.user_metadata.full_name || user.user_metadata.name)) || (email ? email.split('@')[0] : 'Member');
    // Only set username if the profile doesn't already have one - a user
    // who customized their display name via Account Settings must not have
    // it silently reverted to their OAuth/email-derived name on every
    // future sign-in.
    return client.from('profiles').select('username').eq('id', user.id).maybeSingle().then(function (existingRes) {
      var existingName = existingRes && existingRes.data ? existingRes.data.username : null;
      var name = existingName || derivedName;
      var payload = { id: user.id, email: email, updated_at: new Date().toISOString() };
      if (!existingName) payload.username = derivedName;
      var profile = { id: user.id, provider: 'email', name: name, email: email, avatar: '' };
      saveProfile(profile);
      try { localStorage.setItem(AUTH_KEY, 'in'); } catch (e) {}
      return client.from('profiles').upsert(payload).then(function (res) {
        if (res.error) console.warn('[coldd] profile upsert failed:', res.error.message);
        else attributeReferral();
      });
    });
  }

  window.coldAuth = {
    invokeFn: invokeFn,
    logClientError: logClientError,
    avatarUrlFor: avatarUrlFor,
    saveProfile: saveProfile,
    getProfile: getProfile,
    clearProfile: clearProfile,
    applyProfile: applyProfile,
    targetGuildId: TARGET_GUILD_ID,
    checkIsAdmin: checkIsAdmin,
    attributeReferral: attributeReferral,
    getCampaignCode: getCampaignCode,
    signInDiscord: function () {
      var redirectTo = location.origin + '/callback.html';
      client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: redirectTo, scopes: 'identify email guilds guilds.members.read' }
      });
    },
    // Google is a Supabase-native provider, so this is the same one-call shape
    // as Discord - no hand-rolled exchange like Roblox needs. Requires the
    // Google provider to be enabled in Supabase Auth with a client ID/secret
    // from Google Cloud; until then Supabase returns a clear provider error
    // rather than failing silently.
    signInGoogle: function () {
      var redirectTo = location.origin + '/callback.html';
      return client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          // Forces the account chooser instead of silently reusing whichever
          // Google account the browser last used - people share machines.
          queryParams: { prompt: 'select_account' }
        }
      });
    },
    // Roblox isn't a Supabase-native OAuth provider, so this is a hand-
    // rolled OAuth2 redirect (unlike signInDiscord above) - the code
    // exchange happens server-side in roblox-oauth-callback, invoked from
    // roblox-callback.html. Links an existing coldd account; not a
    // primary sign-in method.
    // `returnTo` is where roblox-callback.html should land once the round trip
    // finishes. Linking from the Robux checkout used to end on the dashboard,
    // which abandons a half-finished order: the buyer linked their account in
    // order to pay, and got moved away from the payment they were making.
    signInRoblox: function (returnTo) {
      if (!ROBLOX_OAUTH_CLIENT_ID) { console.error('[coldd] Roblox OAuth client ID not configured yet.'); return; }
      var redirectUri = location.origin + '/roblox-callback.html';
      var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('coldd_roblox_oauth_state', state); } catch (e) {}
      try {
        // Same-origin paths only - this value comes back as a redirect target.
        if (returnTo && returnTo.charAt(0) === '/' && returnTo.charAt(1) !== '/') {
          sessionStorage.setItem('coldd_roblox_return', returnTo);
        } else {
          sessionStorage.removeItem('coldd_roblox_return');
        }
      } catch (e) {}
      var params = new URLSearchParams({
        client_id: ROBLOX_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'openid profile user.inventory-item:read',
        response_type: 'code',
        state: state
      });
      location.href = 'https://apis.roblox.com/oauth/v1/authorize?' + params.toString();
    },
    unlinkRoblox: function () {
      return invokeFn('roblox-oauth-callback', { unlink: true });
    },
    robloxLinkStatus: function () {
      return invokeFn('roblox-link-status', {}).catch(function () {
        return { ok: false, linked: false };
      });
    },
    signUpEmail: function (email, password, username) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: { username: username } }
      });
    },
    requestEmailOtp: function () {
      return client.functions.invoke('email-otp', { body: { action: 'send' } });
    },
    verifyEmailOtp: function (code) {
      return client.functions.invoke('email-otp', { body: { action: 'verify', code: code } }).then(function (res) {
        if (!res.error && res.data && res.data.ok) {
          return client.auth.getUser().then(function (r) {
            if (!r.data || !r.data.user) return res;
            return upsertBasicProfile(r.data.user).then(function () { return res; });
          });
        }
        return res;
      });
    },
    signInEmail: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error || !res.data || !res.data.user) return res;
        return upsertBasicProfile(res.data.user).then(function () { return res; });
      });
    },
    isEmailVerified: function () {
      return client.auth.getUser().then(function (r) {
        if (!r.data || !r.data.user) return false;
        return client.from('profiles').select('email_verified').eq('id', r.data.user.id).single().then(function (res) {
          return !!(res.data && res.data.email_verified);
        });
      });
    },
    emailExists: function (email) {
      return client.rpc('email_exists', { check_email: email }).then(function (res) {
        return !!(res.data === true);
      });
    },
    sendPasswordReset: function (email) {
      return client.auth.resetPasswordForEmail(email);
    },
    verifyRecoveryOtp: function (email, code, newPassword) {
      return client.auth.verifyOtp({ email: email, token: code, type: 'recovery' }).then(function (res) {
        if (res.error) return res;
        return client.auth.updateUser({ password: newPassword }).then(function (upRes) {
          if (upRes.error || !res.data || !res.data.user) return upRes;
          return upsertBasicProfile(res.data.user).then(function () { return upRes; });
        });
      });
    },
    updatePassword: function (password) {
      return client.auth.updateUser({ password: password });
    },
    upsertBasicProfile: upsertBasicProfile,
    signOut: function () {
      clearProfile();
      try { localStorage.setItem(AUTH_KEY, 'out'); } catch (e) {}
      return client.auth.signOut().catch(function () {});
    }
  };

  // ---------------------------------------------------------------------
  // Cookie / storage consent
  //
  // Two categories only, because the site genuinely has two.
  //
  //   essential - the Supabase auth session, the cart, the site gate, and this
  //               consent record itself. Never optional: without them the site
  //               cannot do the thing the visitor came to do, so they are not
  //               offered as a choice and no banner button can switch them off.
  //   analytics - the pageview beacon and the abandoned-cart snapshot. Both
  //               exist for the admin panel, not for the visitor, so both wait
  //               for an explicit yes.
  //
  // The default before any choice is made is NO. allows() returns false while
  // the decision is undecided, so a visitor who ignores the banner entirely is
  // treated as having declined rather than as having agreed by silence.
  // ---------------------------------------------------------------------
  var CONSENT_KEY = 'coldd_cookie_consent';
  var CONSENT_VERSION = 1;

  function readConsent() {
    try {
      var raw = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
      if (!raw || raw.version !== CONSENT_VERSION) return null;
      return raw;
    } catch (e) { return null; }
  }

  function writeConsent(analytics) {
    var rec = { version: CONSENT_VERSION, analytics: !!analytics, ts: new Date().toISOString() };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(rec)); } catch (e) {}
    // Lets already-loaded scripts react without a reload - catalog.js listens
    // so a visitor who accepts gets counted on the page they accepted from,
    // rather than only from the next navigation onward.
    try { window.dispatchEvent(new CustomEvent('coldd:consent', { detail: rec })); } catch (e) {}
    return rec;
  }

  window.coldConsent = {
    get: readConsent,
    decided: function () { return !!readConsent(); },
    allows: function (category) {
      if (category === 'essential') return true;
      var c = readConsent();
      return !!(c && c[category]);
    },
    accept: function () { return writeConsent(true); },
    reject: function () { return writeConsent(false); },
    // Exposed so the privacy policy can offer a "change your choice" control.
    reopen: function () {
      try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
      showConsentBanner();
    }
  };

  function showConsentBanner() {
    if (document.getElementById('cookieBanner')) return;

    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.id = 'cookieBanner';
    // role=region + aria-label rather than role=dialog: this does not trap
    // focus and must not stop anyone reading the page behind it.
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choices');
    bar.innerHTML =
      '<div class="cookie-bar-inner">' +
        '<div class="cookie-bar-tx">' +
          '<h2 class="cookie-bar-h">Cookies</h2>' +
          '<p>We use essential cookies to keep you signed in and your cart intact. ' +
          'We would also like optional analytics cookies to see which pages people actually use. ' +
          '<a href="/privacy-policy">Read our privacy policy</a>.</p>' +
        '</div>' +
        '<div class="cookie-bar-actions">' +
          '<button type="button" class="btn btn-ghost cookie-config" aria-expanded="false">Configure</button>' +
          '<button type="button" class="btn btn-tinted cookie-reject">Essential only</button>' +
          '<button type="button" class="btn btn-primary cookie-accept">Accept all</button>' +
        '</div>' +
        // Per-category detail. Collapsed by default so the common cases stay
        // one click - a preferences panel nobody asked for is friction, but
        // burying the choice behind a link is a dark pattern. Expanding is the
        // middle path.
        '<div class="cookie-cats" hidden>' +
          '<label class="cookie-cat is-locked">' +
            '<input type="checkbox" checked disabled />' +
            '<span class="cookie-cat-tx">' +
              '<span class="cookie-cat-n">Essential <span class="cookie-cat-tag">Always on</span></span>' +
              '<span class="cookie-cat-d">Keeps you signed in, remembers your cart and currency, and stores this cookie choice. The site cannot work without it, so it is not optional.</span>' +
            '</span>' +
          '</label>' +
          '<label class="cookie-cat">' +
            '<input type="checkbox" class="cookie-cat-analytics" />' +
            '<span class="cookie-cat-tx">' +
              '<span class="cookie-cat-n">Analytics</span>' +
              '<span class="cookie-cat-d">Tells us which pages get used and whether a cart was abandoned. Never shared, never used to identify you. Off unless you turn it on.</span>' +
            '</span>' +
          '</label>' +
          '<button type="button" class="btn btn-primary cookie-save">Save preferences</button>' +
        '</div>' +
      '</div>';

    function close() { bar.classList.remove('in'); setTimeout(function () { bar.remove(); }, 220); }
    bar.querySelector('.cookie-accept').addEventListener('click', function () { window.coldConsent.accept(); close(); });
    bar.querySelector('.cookie-reject').addEventListener('click', function () { window.coldConsent.reject(); close(); });

    var cats = bar.querySelector('.cookie-cats');
    var configBtn = bar.querySelector('.cookie-config');
    configBtn.addEventListener('click', function () {
      var open = cats.hidden;
      cats.hidden = !open;
      configBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    bar.querySelector('.cookie-save').addEventListener('click', function () {
      // Saving reflects exactly what the toggles say. An untouched panel saves
      // analytics off, which matches the default - silence is still a decline.
      var on = bar.querySelector('.cookie-cat-analytics').checked;
      if (on) window.coldConsent.accept(); else window.coldConsent.reject();
      close();
    });

    document.body.appendChild(bar);
    // Next frame, so the entrance transition has a resting state to animate
    // from instead of being applied in the same style pass.
    requestAnimationFrame(function () { bar.classList.add('in'); });
  }

  function maybeShowConsentBanner() {
    if (readConsent()) return;
    // The gate page and the OAuth callbacks are not places to ask - they are
    // transient redirects, and the banner would flash and vanish.
    var p = location.pathname;
    if (/lock\.html|callback\.html/.test(p)) return;
    showConsentBanner();
  }

  document.addEventListener('DOMContentLoaded', applyProfile);
  document.addEventListener('DOMContentLoaded', maybeShowConsentBanner);
})();
