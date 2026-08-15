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

  var ICONS = {
    shield: '<path d="M12 3 5 6v5c0 4.6 3 8.4 7 9.9 4-1.5 7-5.3 7-9.9V6l-7-3Z"/>',
    'doc-check': '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="m9 13 2 2 4-4"/>',
    tag: '<path d="M20 13 13 20a2 2 0 0 1-2.8 0L4 13.8V4h9.8L20 10.2a2 2 0 0 1 0 2.8Z"/><circle cx="9" cy="9" r="1.4"/>',
    megaphone: '<path d="M3 9v6h4l8 4V5L7 9H3Z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m20 20-4.35-4.35"/><path d="M10 7v4"/><circle cx="10" cy="13.4" r="0.6" fill="currentColor" stroke="none"/>',
    share: '<circle cx="6" cy="12" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="18" cy="18" r="2.1"/><path d="M8 10.8 16 6.9"/><path d="M8 13.2 16 17.1"/>',
    wrench: '<path d="M13 9h6.5L21 20.5H3L4.5 9H11" /><path d="M9 9V6a3 3 0 0 1 6 0v3" />',
    sparkle: '<path d="M9 4h6l1.5 4L18 20H6l1.5-12L9 4Z"/><path d="M9 10h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>'
  };
  function iconSvg(key) {
    var d = ICONS[key] || ICONS.shield;
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  window.coldSupabase.from('career_roles')
    .select('slug, title, icon, tags, summary, questions')
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
        return '<article class="career-role reveal' + (i % 3 === 1 ? ' d1' : i % 3 === 2 ? ' d2' : '') + '">' +
          '<div class="career-role-ic">' + iconSvg(r.icon) + '</div>' +
          '<h3>' + esc(r.title) + '</h3>' +
          '<p>' + esc(r.summary) + '</p>' +
          '<a class="career-apply" data-arrow="1" href="' + mailto + '">Apply</a>' +
          '</article>';
      }).join('');

      if (window.__scanReveal) window.__scanReveal(grid);
    })
    .catch(function (err) { console.error('[careers] failed to load roles:', err); });
})();
