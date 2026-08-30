-- Reusable email-campaign templates (subject + body + format), stored on
-- the account rather than a single browser so they follow the admin
-- between machines. Admin-only, like career_roles - the client reads and
-- writes directly under the is_admin() policy; there's no edge function.

create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null default '',
  body_text  text not null default '',
  mode       text not null default 'simple' check (mode in ('simple','html')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists email_templates_all_admin on public.email_templates;
create policy email_templates_all_admin on public.email_templates
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.email_templates to authenticated;
