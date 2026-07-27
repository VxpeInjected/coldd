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

  function signIn() {
    try { localStorage.setItem('coldd_auth', 'in'); } catch (_) {}
    location.href = 'dashboard.html';
  }

  document.querySelectorAll('.auth-oauth').forEach(function (b) {
    b.addEventListener('click', function () {
      var form = b.closest('.auth-card').querySelector('.auth-form');
      var p = b.getAttribute('data-provider');
      if (form) flash(form, 'Continuing with ' + p + '...');
      signIn();
    });
  });

  var si = document.getElementById('form-signin');
  if (si) si.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, email = val(si, 'email'), pass = val(si, 'password');
    if (!emailOk(email)) { fieldErr(si, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(si, 'email', '');
    if (!pass) { fieldErr(si, 'password', 'Enter your password.'); ok = false; } else fieldErr(si, 'password', '');
    if (ok) { flash(si, 'Signed in, redirecting...'); signIn(); }
  });

  var su = document.getElementById('form-signup');
  if (su) su.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, email = val(su, 'email'), pass = val(su, 'password'), conf = val(su, 'confirm');
    var tos = su.querySelector('[name="tos"]');
    if (!emailOk(email)) { fieldErr(su, 'email', 'Enter a valid email.'); ok = false; } else fieldErr(su, 'email', '');
    if (pass.length < 8) { fieldErr(su, 'password', 'Use at least 8 characters.'); ok = false; } else fieldErr(su, 'password', '');
    if (!conf || conf !== pass) { fieldErr(su, 'confirm', "Passwords don't match."); ok = false; } else fieldErr(su, 'confirm', '');
    var te = su.querySelector('.auth-err[data-for="tos"]');
    if (tos && !tos.checked) { if (te) te.textContent = 'Please accept the Terms to continue.'; ok = false; } else if (te) te.textContent = '';
    if (ok) { flash(su, 'Account created, redirecting...'); signIn(); }
  });

  var fo = document.getElementById('form-forgot');
  if (fo) fo.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = val(fo, 'email');
    if (!emailOk(email)) { fieldErr(fo, 'email', 'Enter a valid email.'); return; }
    fieldErr(fo, 'email', '');
    flash(fo, 'If an account exists for ' + email + ", we'll email a reset link shortly.");
  });

  var rs = document.getElementById('form-reset');
  if (rs) rs.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, pass = val(rs, 'password'), conf = val(rs, 'confirm');
    if (pass.length < 8) { fieldErr(rs, 'password', 'Use at least 8 characters.'); ok = false; } else fieldErr(rs, 'password', '');
    if (!conf || conf !== pass) { fieldErr(rs, 'confirm', "Passwords don't match."); ok = false; } else fieldErr(rs, 'confirm', '');
    if (ok) flash(rs, 'Password updated (demo), connect a backend to make it real.');
  });
})();
