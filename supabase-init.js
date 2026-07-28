(function () {
  var SUPABASE_URL = 'https://ekinmytmudjwfaqaqswp.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_q5JwjFnMT_0Uhu5rAlAkQA_DEGnhwV7';
  // Set this to your Coldd Development Discord server's guild ID to enable
  // per-member role/nickname lookups via the guilds.members.read scope.
  // Leave empty to skip that lookup (guild LIST still works either way).
  var TARGET_GUILD_ID = '1247414059909779578';
  var PROFILE_KEY = 'coldd_profile';
  var AUTH_KEY = 'coldd_auth';

  // Discord user IDs allowed into admin.html and shown the admin-panel link
  // on the dashboard. This is a client-side gate only - it hides the admin
  // UI from everyone else, but doesn't stop a determined user from reading
  // the underlying (still-mock) data via devtools. Real enforcement needs
  // server-side RLS keyed off profiles.is_admin once the backend is live.
  var ADMIN_WHITELIST = ['1327350011054526505', '1253736765986967622'];

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

  // Reads the Discord ID out of the SDK's own persisted session (no network
  // call - same localStorage key window.coldSupabase.auth.getSession() reads
  // from), mirroring the identity_data extraction callback.html does right
  // after OAuth completes.
  function currentDiscordId() {
    try {
      var raw = localStorage.getItem('sb-ekinmytmudjwfaqaqswp-auth-token');
      var parsed = raw && JSON.parse(raw);
      if (!parsed || !parsed.user) return null;
      if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) return null;
      var identities = parsed.user.identities || [];
      var discordIdentity = identities.filter(function (i) { return i.provider === 'discord'; })[0];
      var data = (discordIdentity && discordIdentity.identity_data) || {};
      return data.provider_id || data.sub || (parsed.user.user_metadata && parsed.user.user_metadata.provider_id) || null;
    } catch (e) { return null; }
  }
  function isAdminWhitelisted() { return ADMIN_WHITELIST.indexOf(currentDiscordId()) >= 0; }

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

    var refLink = document.getElementById('refLink');
    if (refLink && displayName) {
      var slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
      refLink.value = 'https://coldd.gg/r/' + slug;
    }
  }

  function upsertBasicProfile(user) {
    var email = user.email || '';
    var name = (user.user_metadata && (user.user_metadata.username || user.user_metadata.full_name || user.user_metadata.name)) || (email ? email.split('@')[0] : 'Member');
    var payload = { id: user.id, username: name, email: email, updated_at: new Date().toISOString() };
    client.from('profiles').upsert(payload).then(function (res) {
      if (res.error) console.warn('[coldd] profile upsert failed:', res.error.message);
    });
    var profile = { id: user.id, provider: 'email', name: name, email: email, avatar: '' };
    saveProfile(profile);
    try { localStorage.setItem(AUTH_KEY, 'in'); } catch (e) {}
    return profile;
  }

  window.coldAuth = {
    saveProfile: saveProfile,
    getProfile: getProfile,
    clearProfile: clearProfile,
    applyProfile: applyProfile,
    targetGuildId: TARGET_GUILD_ID,
    currentDiscordId: currentDiscordId,
    isAdminWhitelisted: isAdminWhitelisted,
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
        scope: 'openid profile',
        response_type: 'code',
        state: state
      });
      location.href = 'https://apis.roblox.com/oauth/v1/authorize?' + params.toString();
    },
    unlinkRoblox: function () {
      return client.functions.invoke('roblox-oauth-callback', { body: { unlink: true } });
    },
    robloxLinkStatus: function () {
      return client.functions.invoke('roblox-link-status', { body: {} }).then(function (res) {
        return (res && res.data) || { ok: false, linked: false };
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
