-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run
-- (idempotent). Requires fix_admin_policy_recursion.sql (is_admin()) to
-- already exist.
--
-- Backs the Blog/Tutorials/Releases CMS. One generic table for all three
-- content types (they're all "structured JSON the storefront renders as a
-- card/detail page") rather than three near-identical tables - type-specific
-- fields live in `data`, only what's needed for querying/moderation
-- (type, slug, visible) is a real column.

create table if not exists public.content (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('post', 'tutorial', 'release')),
  slug text not null,
  visible boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, slug)
);

alter table public.content enable row level security;

drop policy if exists "content_select_visible" on public.content;
create policy "content_select_visible" on public.content
  for select using (visible = true);

drop policy if exists "content_select_admin" on public.content;
create policy "content_select_admin" on public.content
  for select using (public.is_admin());

-- No client write policy - all writes go through admin-upsert-content /
-- admin-delete-content (is_admin gated, service role).

create index if not exists content_type_idx on public.content(type);
