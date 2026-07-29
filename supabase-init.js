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
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.coldSupabase = client;

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
          throw new Error((data && data.error) || res.error.message || 'Request failed.');
        });
      }
      if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || 'Request failed.');
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

  function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} }
  function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { return null; } }
  function clearProfile() { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }
  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] || '').toUpperCase();
  }
  function capitalizeEmailPrefix(email) {
    if (!email) return '';
    var prefix = email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  function applyProfile() {
    var p = getProfile();
    if (!p) return;
    var displayName = (p.provider === 'email' ? capitalizeEmailPrefix(p.email) : p.name) || p.name;

    document.querySelectorAll('#dashName, #coUserName').forEach(function (el) { el.textContent = displayName; });
    document.querySelectorAll('#dashEmail, #coUserEmail').forEach(function (el) { el.textContent = p.email || ''; });

    document.querySelectorAll('#dashAvatar, #coAvatar').forEach(function (el) {
      if (p.avatar) {
        el.style.backgroundImage = 'url(' + p.avatar + ')';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.textContent = initials(displayName);
      }
    });

    var welcome = document.getElementById('dashWelcomeName');
    if (welcome) welcome.textContent = (displayName || '').split(' ')[0] || displayName;

    var acName = document.getElementById('ac-name');
    if (acName) acName.value = displayName || '';
    var acEmail = document.getElementById('ac-email');
    if (acEmail) acEmail.value = p.email || '';

  }

  function upsertBasicProfile(user) {
    var email = user.email || '';
    var name = (user.user_metadata && (user.user_metadata.username || user.user_metadata.full_name || user.user_metadata.name)) || (email ? email.split('@')[0] : 'Member');
    var payload = { id: user.id, username: name, email: email, updated_at: new Date().toISOString() };
    client.from('profiles').upsert(payload).then(function (res) {
      if (res.error) console.warn('[coldd] profile upsert failed:', res.error.message);
      else attributeReferral();
    });
    var profile = { id: user.id, provider: 'email', name: name, email: email, avatar: '' };
    saveProfile(profile);
    try { localStorage.setItem(AUTH_KEY, 'in'); } catch (e) {}
    return profile;
  }

  window.coldAuth = {
    invokeFn: invokeFn,
    saveProfile: saveProfile,
    getProfile: getProfile,
    clearProfile: clearProfile,
    applyProfile: applyProfile,
    targetGuildId: TARGET_GUILD_ID,
    checkIsAdmin: checkIsAdmin,
    attributeReferral: attributeReferral,
    signInDiscord: function () {
      var redirectTo = location.origin + '/callback.html';
      client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: redirectTo, scopes: 'identify email guilds guilds.members.read' }
      });
    },
    // Roblox isn't a Supabase-native OAuth provider, so this is a hand-
    // rolled OAuth2 redirect (unlike signInDiscord above) - the code
    // exchange happens server-side in roblox-oauth-callback, invoked from
    // roblox-callback.html. Links an existing coldd account; not a
    // primary sign-in method.
    signInRoblox: function () {
      if (!ROBLOX_OAUTH_CLIENT_ID) { console.error('[coldd] Roblox OAuth client ID not configured yet.'); return; }
      var redirectUri = location.origin + '/roblox-callback.html';
      var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('coldd_roblox_oauth_state', state); } catch (e) {}
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
          client.auth.getUser().then(function (r) {
            if (r.data && r.data.user) upsertBasicProfile(r.data.user);
          });
        }
        return res;
      });
    },
    signInEmail: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (!res.error && res.data && res.data.user) upsertBasicProfile(res.data.user);
        return res;
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
          if (!upRes.error && res.data && res.data.user) upsertBasicProfile(res.data.user);
          return upRes;
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
      client.auth.signOut().catch(function () {});
    }
  };

  document.addEventListener('DOMContentLoaded', applyProfile);
})();
