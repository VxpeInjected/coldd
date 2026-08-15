// site-gate.js
//
// Loaded on every page, right after supabase-init.js. Checks the
// site-wide mode (open / maintenance / locked) and gates accordingly.
//
// FAIL-SAFE BY DESIGN: any error, missing data, or unexpected response
// while checking site_status is treated as "open" (do nothing). This
// must never be able to lock out the whole site because of a network
// hiccup or a misconfigured row - the failure mode is "gate didn't
// apply", never "gate applied when it shouldn't have".
(function () {
  if (!window.coldSupabase) return;

  var path = location.pathname.replace(/\/+$/, '') || '/';
  // Never gate the shared-password unlock page itself, or the admin
  // panel (which has its own Discord-whitelist gate and needs to stay
  // reachable so an admin can turn maintenance/locked mode back off).
  if (path === '/lock.html' || path.indexOf('/admin') === 0) return;

  function fmtCountdown(ms) {
    if (ms <= 0) return 'Back shortly';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    var parts = [];
    if (h) parts.push(h + 'h');
    if (h || m) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function showMaintenanceOverlay(status) {
    if (document.getElementById('siteMaintenanceOverlay')) return;
    var endsAt = status.maintenance_ends_at ? new Date(status.maintenance_ends_at).getTime() : null;
    var msg = status.maintenance_message
      ? String(status.maintenance_message).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; })
      : "We're pushing an update. Back shortly.";

    var overlay = document.createElement('div');
    overlay.id = 'siteMaintenanceOverlay';
    overlay.className = 'gate-overlay';
    overlay.innerHTML =
      '<div class="gate-card glass">' +
        '<img class="gate-logo" src="/logo.png" alt="coldd" />' +
        '<h2>Site under maintenance</h2>' +
        '<p class="gate-msg">' + msg + '</p>' +
        (endsAt ? '<p id="siteMaintCountdown" class="gate-countdown"></p>' : '') +
      '</div>' +
      '<button id="siteMaintLock" class="gate-lock pm-x" aria-label="Staff sign in">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '</button>';
    document.documentElement.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (endsAt) {
      var cdEl = document.getElementById('siteMaintCountdown');
      var tick = function () {
        if (!cdEl) return;
        cdEl.textContent = fmtCountdown(endsAt - Date.now());
      };
      tick();
      setInterval(tick, 1000);
    }

    var lockBtn = document.getElementById('siteMaintLock');
    lockBtn.addEventListener('click', function () {
      if (document.getElementById('siteMaintSignin')) return;
      var box = document.createElement('div');
      box.id = 'siteMaintSignin';
      box.className = 'gate-signin glass';
      box.innerHTML = '<p>Staff sign-in only. Signing in does not grant public access during maintenance.</p>' +
        '<button id="siteMaintDiscord" class="auth-oauth" type="button" data-provider="Discord">' +
          '<svg viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>' +
          ' Sign in with Discord' +
        '</button>';
      overlay.appendChild(box);
      document.getElementById('siteMaintDiscord').addEventListener('click', function () {
        if (window.coldAuth) window.coldAuth.signInDiscord();
      });
    });
  }

  function showWhitelistBanner() {
    if (document.getElementById('siteWhitelistBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'siteWhitelistBanner';
    banner.className = 'gate-banner';
    banner.textContent = "You're viewing as a whitelisted staff member - the site is still under maintenance for everyone else.";
    document.documentElement.appendChild(banner);
  }

  window.coldSupabase.from('site_status').select('*').eq('id', true).maybeSingle().then(function (res) {
    var status = res && res.data;
    if (!status || res.error || status.mode === 'open') return;

    if (status.mode === 'locked') {
      var alreadyUnlocked = false;
      try { alreadyUnlocked = sessionStorage.getItem('coldd_unlocked') === '1'; } catch (e) {}
      if (alreadyUnlocked) return;
      location.replace('/lock.html?r=' + encodeURIComponent(path + location.search));
      return;
    }

    if (status.mode === 'maintenance') {
      window.coldSupabase.auth.getSession().then(function (sres) {
        var session = sres && sres.data ? sres.data.session : null;
        if (!session) { showMaintenanceOverlay(status); return; }
        window.coldAuth.checkIsAdmin().then(function (info) {
          if (info.isAdmin) showWhitelistBanner();
          else showMaintenanceOverlay(status);
        });
      }).catch(function () {});
    }
  }).catch(function () {
    // Fail open - see file header.
  });

  // Separate, independent check: a banned account gets signed out and
  // told why, no matter which page it's on. Also fails open on any
  // error - a check that couldn't complete must never itself look like
  // a ban.
  window.coldSupabase.auth.getSession().then(function (sres) {
    var session = sres && sres.data ? sres.data.session : null;
    if (!session) return;
    window.coldSupabase.from('profiles').select('banned, ban_reason').eq('id', session.user.id).maybeSingle().then(function (pres) {
      var prof = pres && pres.data;
      if (!prof || !prof.banned) return;
      window.coldSupabase.auth.signOut().catch(function () {}).then(function () {
        try { localStorage.setItem('coldd_auth', 'out'); } catch (e) {}
        var overlay = document.createElement('div');
        overlay.className = 'gate-overlay';
        overlay.innerHTML = '<div class="gate-card glass">' +
          '<img class="gate-logo" src="/logo.png" alt="coldd" />' +
          '<h2>Account suspended</h2>' +
          '<p class="gate-msg">' + (prof.ban_reason ? String(prof.ban_reason).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) : 'Contact support if you believe this is a mistake.') + '</p>' +
          '<p class="gate-msg" style="margin-top:14px;"><a href="mailto:support@coldd.dev" style="color:var(--accent);font-weight:600;">support@coldd.dev</a></p>' +
        '</div>';
        document.documentElement.appendChild(overlay);
        document.body.style.overflow = 'hidden';
      });
    }).catch(function () {});
  }).catch(function () {});
})();
