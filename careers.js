// careers.js
//
// Renders /careers' role cards from public.career_roles (see
// supabase/career_roles.sql) instead of hardcoded markup, so the admin
// panel's Careers section can add/edit/reorder roles without a code
// change. icon is a key into ICONS below, drawn as inline SVG - never
// raw admin-entered markup, so a role's stored data can't inject
// arbitrary HTML into the page.
(function () {
  var grid = document.getElementById('careerRolesGrid');
  if (!grid || !window.coldSupabase) return;

  var ARROW = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return n < 9 ? '0' + (n + 1) : String(n + 1); }

  window.coldSupabase.from('career_roles')
    .select('slug, title, tags, summary, questions')
    .eq('active', true)
    .order('sort_order')
    .then(function (res) {
      if (res.error) { console.error('[careers] failed to load roles:', res.error.message); return; }
      var roles = res.data || [];
      if (!roles.length) { grid.innerHTML = '<p class="pd-empty">No open roles right now - check back soon.</p>'; return; }

      grid.innerHTML = roles.map(function (r, i) {
        var questions = Array.isArray(r.questions) ? r.questions : [];
        var bodyLines = ['Portfolio/links:', ''];
        questions.forEach(function (q) { bodyLines.push(q, ''); });
        var mailto = 'mailto:support@coldd.dev?subject=' + encodeURIComponent('Application: ' + r.title) +
          '&body=' + encodeURIComponent(bodyLines.join('\n'));
        var tags = Array.isArray(r.tags) ? r.tags : [];
        return '<article class="career-listing reveal">' +
          '<div class="cl-num">' + pad2(i) + '</div>' +
          '<div class="cl-main">' +
          '<h3>' + esc(r.title) + '</h3>' +
          '<div class="cl-tags">' + tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
          '</div>' +
          '<div class="cl-body">' +
          '<p>' + esc(r.summary) + '</p>' +
          '<a class="career-apply" href="' + mailto + '">Apply' + ARROW + '</a>' +
          '</div>' +
          '</article>';
      }).join('');

      if (window.__scanReveal) window.__scanReveal(grid);
    })
    .catch(function (err) { console.error('[careers] failed to load roles:', err); });
})();
