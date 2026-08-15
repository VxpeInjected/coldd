-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent).
--
-- Backs /careers' role cards and the admin panel's Careers section.
-- Previously hardcoded directly into careers/index.html - every new
-- role, wording tweak, or reorder needed a code change. icon is a key
-- into a small fixed set drawn as inline SVG on the frontend (see
-- careers.js), not raw markup, so admin-entered data can never inject
-- arbitrary HTML/SVG into the page. questions is the set of prompts
-- shown to an applicant before they hit Apply - folded into the
-- pre-filled email body, since the site has no application-submission
-- backend (mailto stays the actual apply mechanism).

create table if not exists public.career_roles (
  id bigint generated always as identity primary key,
  slug text unique not null,
  title text not null,
  icon text not null default 'shield',
  tags text[] not null default '{}',
  summary text not null,
  questions jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_roles_sort_idx on public.career_roles (sort_order);

alter table public.career_roles enable row level security;

drop policy if exists "career_roles_select_active" on public.career_roles;
create policy "career_roles_select_active" on public.career_roles
  for select using (active = true or public.is_admin());

drop policy if exists "career_roles_write_admin" on public.career_roles;
create policy "career_roles_write_admin" on public.career_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed with the roles that used to be hardcoded, so the page doesn't go
-- blank the moment this replaces the static markup. Safe to re-run:
-- only inserts if the table is empty.
insert into public.career_roles (slug, title, icon, tags, summary, questions, sort_order)
select * from (values
  ('moderator', 'Moderator', 'shield', array['Contract','Remote'], 'Help moderate the Discord server alongside a great team.', '["What server(s) have you moderated before, and for how long?","How would you handle a heated dispute between two members?"]'::jsonb, 0),
  ('roblox-scripter', 'Roblox Scripter', 'doc-check', array['Contract','Remote'], 'Systems, gameplay logic, and full game backends in Luau, shipped from a brief to production-ready.', '["Link 2-3 systems or games you have scripted end to end.","What''s a bug you''re proud of tracking down?"]'::jsonb, 1),
  ('3d-builder', '3D Builder / Environment Artist', 'tag', array['Contract','Remote'], 'Maps, buildings, and environments for Roblox game templates, clean topology and strong lighting.', '["Link a portfolio or a few build screenshots.","What''s your typical poly budget for a full map?"]'::jsonb, 2),
  ('community-rep', 'Community Representative', 'megaphone', array['Contract','Remote'], 'Keep the community active with events, giveaways, and a reason to check back in.', '["Have you run community events before? Describe one.","How many hours a week can you commit?"]'::jsonb, 3),
  ('scam-investigator', 'Scam Investigator', 'search', array['Contract','Remote'], 'Keep the marketplace safe by reviewing reports and flagging bad actors before they spread.', '["Describe how you''d investigate a reported scam claim.","Any experience with trust & safety or moderation tooling?"]'::jsonb, 4),
  ('social-media', 'Social Media', 'share', array['Contract','Remote'], 'Grow the community by taking coldd''s presence to other platforms.', '["Which platforms have you grown before, and by how much?","Link an account or campaign you''ve run."]'::jsonb, 5),
  ('minecraft-plugin-dev', 'Minecraft Plugin Developer', 'wrench', array['Contract','Remote'], 'Java/Kotlin plugins powering hubs, lobbies, and full server setups on Paper/Spigot.', '["Link 2-3 plugins or servers you''ve built.","Which Minecraft server software have you worked with?"]'::jsonb, 6),
  ('vfx-animator', 'VFX & Animation Artist', 'sparkle', array['Contract','Remote'], 'Particle effects, rigged animations, and motion, running in-engine on Roblox and Minecraft.', '["Link a reel or a few in-engine clips.","Roblox, Minecraft, or both?"]'::jsonb, 7),
  ('general', 'General Application', 'clock', array['Any role'], 'Don''t see a fit above? Send your portfolio anyway, we keep strong applications on file.', '["What role or area would you want to work on?","Link a portfolio or relevant work."]'::jsonb, 8)
) as seed
where not exists (select 1 from public.career_roles);
