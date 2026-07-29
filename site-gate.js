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

    var overlay = document.createElement('div');
    overlay.id = 'siteMaintenanceOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0a0a0a;color:#d7d7d7;' +
      'font-family:ui-monospace,monospace;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;';
    overlay.innerHTML =
      '<div>' +
        '<p style="font-size:20px;font-weight:700;margin:0 0 10px;">Site under maintenance.</p>' +
        '<p style="font-size:14px;color:#a3a3a3;margin:0 0 4px;">' + (status.maintenance_message ? String(status.maintenance_message).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) : "We'll be back soon.") + '</p>' +
        (endsAt ? '<p id="siteMaintCountdown" style="font-size:13px;color:#666;margin:8px 0 0;"></p>' : '') +
      '</div>' +
      '<button id="siteMaintLock" aria-label="Staff sign in" style="position:fixed;bottom:18px;right:18px;width:38px;height:38px;border-radius:50%;' +
        'background:#151515;border:1px solid #262626;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;">' +
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
      box.style.cssText = 'position:fixed;bottom:64px;right:18px;background:#111;border:1px solid #262626;border-radius:10px;padding:16px;width:220px;';
      box.innerHTML = '<p style="font-size:12px;color:#a3a3a3;margin:0 0 10px;">Staff sign-in only. Signing in does not grant public access during maintenance.</p>' +
        '<button id="siteMaintDiscord" style="width:100%;padding:9px;border-radius:8px;border:none;background:#5865F2;color:#fff;font-size:13px;cursor:pointer;">Sign in with Discord</button>';
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
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#b23a3a;color:#fff;' +
      'font-family:ui-monospace,monospace;font-size:13px;text-align:center;padding:8px 12px;';
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
        if (session && window.coldAuth && window.coldAuth.isAdminWhitelisted()) {
          showWhitelistBanner();
          return;
        }
        showMaintenanceOverlay(status);
      }).catch(function () {});
    }
  }).catch(function () {
    // Fail open - see file header.
  });
})();
