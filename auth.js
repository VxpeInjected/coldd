(function () {
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function val(form, name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ''; }
  function fieldErr(form, name, msg) {
    var f = form.querySelector('.auth-field[data-for="' + name + '"]');
    if (!f) return;
    f.classList.toggle('invalid', !!msg);
    var e = f.querySelector('.auth-err'); if (e) e.textContent = msg || '';
  }
  function flash(form, text) {
    var card = form.closest('.auth-card'); if (!card) return;
    var msg = card.querySelector('.auth-msg'); if (!msg) return;
    msg.textContent = text; msg.classList.add('show');
  }

  document.querySelectorAll('.auth-pw-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('input'); if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  document.querySelectorAll('.auth-oauth').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.getAttribute('data-provider');
      if (p === 'Discord') {
        if (window.coldAuth) window.coldAuth.signInDiscord();
        return;
      }
      try { localStorage.setItem('coldd_auth', 'in'); } catch (e) {}
      location.href = 'dashboard.html';
    });
  });

  var si = document.getElementById('form-signin');
  if (si) si.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, email = val(si, 'email'), pass = val(si, 'password');
    if (!emailOk(email)) { fieldErr(si, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(si, 'email', '');
    if (!pass) { fieldErr(si, 'password', 'Enter your password.'); ok = false; } else fieldErr(si, 'password', '');
    if (!ok || !window.coldAuth) return;

    var btn = si.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    window.coldAuth.signInEmail(email, pass).then(function (res) {
      if (res.error) {
        window.coldAuth.emailExists(email).then(function (exists) {
          if (btn) btn.disabled = false;
          if (!exists) {
            var card = si.closest('.auth-card'), msg = card && card.querySelector('.auth-msg');
            if (msg) { msg.innerHTML = 'No account found for that email. <a href="signup.html">Create one instead?</a>'; msg.classList.add('show'); }
            return;
          }
          var m = /confirm/i.test(res.error.message) ? 'Please confirm your email first — check your inbox.' : 'Incorrect password.';
          flash(si, m);
        });
        return;
      }
      window.coldAuth.isEmailVerified().then(function (verified) {
        if (btn) btn.disabled = false;
        if (!verified) {
          window.coldAuth.requestEmailOtp().then(function () { showVerifyStep(email); });
          return;
        }
        location.href = 'dashboard.html';
      });
    });
  });

  var su = document.getElementById('form-signup');
  var sv = document.getElementById('form-verify');
  var pendingEmail = '';

  function showVerifyStep(email) {
    pendingEmail = email;
    if (si) si.hidden = true;
    if (su) su.hidden = true;
    if (sv) {
      sv.hidden = false;
      var sub = document.getElementById('verifySub');
      if (sub) sub.textContent = 'Enter the code we emailed to ' + email + '.';
    }
  }

  if (su) su.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, email = val(su, 'email'), pass = val(su, 'password'), conf = val(su, 'confirm');
    var tos = su.querySelector('[name="tos"]');
    if (!emailOk(email)) { fieldErr(su, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(su, 'email', '');
    if (pass.length < 8) { fieldErr(su, 'password', 'Use at least 8 characters.'); ok = false; } else fieldErr(su, 'password', '');
    if (!conf || conf !== pass) { fieldErr(su, 'confirm', "Passwords don't match."); ok = false; } else fieldErr(su, 'confirm', '');
    var te = su.querySelector('.auth-err[data-for="tos"]');
    if (tos && !tos.checked) { if (te) te.textContent = 'Please accept the Terms to continue.'; ok = false; } else if (te) te.textContent = '';
    if (!ok || !window.coldAuth) return;

    var btn = su.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    window.coldAuth.signUpEmail(email, pass).then(function (res) {
      if (res.error) { if (btn) btn.disabled = false; flash(su, res.error.message); return; }
      window.coldAuth.requestEmailOtp().then(function (otpRes) {
        if (btn) btn.disabled = false;
        if (otpRes.error) { flash(su, "Account created, but we couldn't send the code. Try resending on the next screen."); }
        showVerifyStep(email);
      });
    });
  });

  if (sv) sv.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = val(sv, 'code').toUpperCase();
    if (!code || code.length < 6) { fieldErr(sv, 'code', 'Enter the 6-character code.'); return; }
    fieldErr(sv, 'code', '');
    var btn = sv.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    window.coldAuth.verifyEmailOtp(code).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.error || !res.data || !res.data.ok) {
        var m = (res.data && res.data.error) || 'Incorrect or expired code.';
        flash(sv, m);
        return;
      }
      location.href = 'dashboard.html';
    });
  });

  var resendBtn = document.getElementById('btnResendCode');
  if (resendBtn) resendBtn.addEventListener('click', function () {
    resendBtn.disabled = true;
    window.coldAuth.requestEmailOtp().then(function (res) {
      resendBtn.disabled = false;
      flash(sv, res.error ? "Couldn't resend right now, try again shortly." : 'New code sent to ' + pendingEmail + '.');
    });
  });

  var fo = document.getElementById('form-forgot');
  if (fo) fo.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = val(fo, 'email');
    if (!emailOk(email)) { fieldErr(fo, 'email', 'Enter a valid email.'); return; }
    fieldErr(fo, 'email', '');
    if (window.coldAuth) window.coldAuth.sendPasswordReset(email);
    flash(fo, 'If an account exists for ' + email + ", we'll email a reset link shortly.");
  });

  var rs = document.getElementById('form-reset');
  if (rs) rs.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, pass = val(rs, 'password'), conf = val(rs, 'confirm');
    if (pass.length < 8) { fieldErr(rs, 'password', 'Use at least 8 characters.'); ok = false; } else fieldErr(rs, 'password', '');
    if (!conf || conf !== pass) { fieldErr(rs, 'confirm', "Passwords don't match."); ok = false; } else fieldErr(rs, 'confirm', '');
    if (!ok || !window.coldAuth) return;
    window.coldAuth.updatePassword(pass).then(function (res) {
      if (res.error) { flash(rs, res.error.message); return; }
      flash(rs, 'Password updated — you can sign in now.');
      setTimeout(function () { location.href = 'signin.html'; }, 1200);
    });
  });
})();
