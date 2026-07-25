(function () {
  var SUPABASE_URL = 'https://auypmvrzvmvoulobvkus.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eXBtdnJ6dm12b3Vsb2J2a3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjU3NjcsImV4cCI6MjEwMDUwMTc2N30.20Cl68wK2uOGgzd3onzqvVR_GDYLCSwgI8oDarNzRkw';
  // Set this to your Coldd Development Discord server's guild ID to enable
  // per-member role/nickname lookups via the guilds.members.read scope.
  // Leave empty to skip that lookup (guild LIST still works either way).
  var TARGET_GUILD_ID = '1247414059909779578';
  var PROFILE_KEY = 'coldd_profile';
  var AUTH_KEY = 'coldd_auth';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[coldd] Supabase SDK failed to load.');
    return;
  }
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.coldSupabase = client;

  function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} }
  function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { return null; } }
  function clearProfile() { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }
  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] || '').toUpperCase();
  }

  function applyProfile() {
    var p = getProfile();
    if (!p) return;

    document.querySelectorAll('#dashName, #coUserName').forEach(function (el) { el.textContent = p.name; });
    document.querySelectorAll('#dashEmail, #coUserEmail').forEach(function (el) { el.textContent = p.email || ''; });

    document.querySelectorAll('#dashAvatar, #coAvatar').forEach(function (el) {
      if (p.avatar) {
        el.style.backgroundImage = 'url(' + p.avatar + ')';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.textContent = initials(p.name);
      }
    });

    var welcome = document.getElementById('dashWelcomeName');
    if (welcome) welcome.textContent = (p.name || '').split(' ')[0] || p.name;

    var acName = document.getElementById('ac-name');
    if (acName) acName.value = p.name || '';
    var acEmail = document.getElementById('ac-email');
    if (acEmail) acEmail.value = p.email || '';

    var refLink = document.getElementById('refLink');
    if (refLink && p.name) {
      var slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
      refLink.value = 'https://coldd.gg/r/' + slug;
    }
  }

  function upsertBasicProfile(user) {
    var email = user.email || '';
    var name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (email ? email.split('@')[0] : 'Member');
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
    signInDiscord: function () {
      var redirectTo = location.origin + '/coldd/callback.html';
      client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: redirectTo, scopes: 'identify email guilds guilds.members.read' }
      });
    },
    signUpEmail: function (email, password) {
      return client.auth.signUp({ email: email, password: password });
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
    sendPasswordReset: function (email) {
      return client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/coldd/reset.html' });
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
