-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- The careers page previously seeded 9 roles that mostly weren't real
-- openings. Reduces /careers to the one role actually open right now
-- and retires the rest without deleting them, so re-opening a role
-- later is a toggle in the admin panel, not lost copy.

update public.career_roles set active = false, updated_at = now()
where slug <> 'roblox-development-team';

insert into public.career_roles (slug, title, icon, tags, summary, questions, sort_order, active)
values (
  'roblox-development-team',
  'Roblox Development Team',
  'doc-check',
  array['Contract','Remote'],
  'Scripting, building, UI, and VFX for coldd''s Roblox catalog. One posting covering the full range, tell us where you''re strongest.',
  '["Link 2-3 pieces of Roblox work you''re proud of - scripts, builds, UI, or VFX.","Which area are you strongest in, and what would you want to work on first?"]'::jsonb,
  0,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  icon = excluded.icon,
  tags = excluded.tags,
  summary = excluded.summary,
  questions = excluded.questions,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();
